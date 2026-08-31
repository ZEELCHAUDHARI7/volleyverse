# VolleyVerse — Self-Hosted Deployment Plan

**Status:** proposal — nothing purchased or changed yet.
**Goal:** move off Vercel onto a domain + VPS we own, at minimum
predictable cost, with a CI/CD pipeline that scales as the app grows.

This app has no Vercel-specific dependencies (no `next/image`, ISR,
Edge Runtime, or Server Actions — confirmed by grep across `src/`), so
this move carries no rewrite risk. Supabase is untouched throughout —
only the frontend's home changes.

---

## 1. Budget summary

| Item | Choice | Cost |
| --- | --- | --- |
| Domain | `.com`, any low-markup registrar | ~$10–12/yr |
| DNS + CDN | Cloudflare (free plan) | $0 |
| Server | 1 small VPS (see §3) | ~$4–6/mo |
| Container registry | GitHub Container Registry (free, private) | $0 |
| CI/CD | GitHub Actions (free tier, public/private repo minutes) | $0 |
| TLS certificates | Caddy + Let's Encrypt (automatic) | $0 |
| Uptime monitoring | UptimeRobot (free plan) | $0 |
| Database | Supabase — **recommend upgrading to Pro before real data enters** (see §7) | ~$25/mo |

**Total new spend for hosting: roughly $6/mo + ~$12/yr ≈ $80–85/year.**
Add Supabase Pro (§7) and the realistic run-rate is closer to **~$31/mo** —
still small, but this is the one line item where "minimum budget" and
"our data is safe" pull in different directions, so it's called out
separately rather than folded quietly into the hosting number above.

---

## 2. Domain

**Buy from:** Porkbun or Cloudflare Registrar — both sell at close to
wholesale price with no upsell dark patterns (Namecheap/GoDaddy tend to
pad renewal pricing and push add-ons). Cloudflare Registrar only
resells domains it can also manage DNS for, which is convenient here.

**Steps:**
1. Search and register the domain. Enable auto-renew and WHOIS privacy
   (both usually free at these registrars — confirm at checkout).
2. Add the site to Cloudflare (free plan) for DNS management, even if
   registered elsewhere — this gets free DDoS protection, edge
   caching, and hides the VPS's real IP behind Cloudflare's proxy.
3. Once the VPS exists (§3), create in Cloudflare:
   - `A` record: `@` → VPS IPv4 address (proxied, orange cloud on)
   - `A` (or `CNAME`) record: `www` → same target, or a redirect rule
     `www.domain.com` → `domain.com`
4. Confirm current registrar pricing before purchase — it changes.

---

## 3. Server

**Recommendation: Hetzner Cloud CX22** (2 vCPU, 4 GB RAM, 40 GB NVMe,
20 TB traffic) — roughly **€4–5/mo**. Best RAM-per-euro of the
budget providers, which matters because the container needs headroom
even though the *build* happens in CI, not on the box.

**Alternative:** DigitalOcean's $6/mo droplet (1 GB RAM) if you'd
rather have a US-based provider with more mainstream tutorials/support
history, or need onboarding without Hetzner's identity-verification
step (can take up to a day for new accounts).

**OS:** Ubuntu 24.04 LTS.

Why not the cheapest possible box: Next.js + Docker + Caddy + OS
overhead is fine on 1 GB but leaves zero room for anything else
(a second container later, a `docker build` run by hand, etc). The
jump from 1 GB → 4 GB is a couple dollars a month — worth it for the
headroom.

---

## 4. Server hardening (do this before deploying anything)

```bash
# as root, first login
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# sshd_config
# PermitRootLogin no
# PasswordAuthentication no
systemctl restart sshd

# firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# unattended security patches + brute-force protection
apt install -y unattended-upgrades fail2ban
dpkg-reconfigure --priority=low unattended-upgrades
```

Then install Docker Engine + the Compose plugin from Docker's official
apt repo (not the Ubuntu-packaged `docker.io`, which lags behind).

---

## 5. Application packaging

**`next.config.ts`** needs one addition so the Docker image is small
and self-contained:

```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
};
```

**`Dockerfile`** (multi-stage — build deps aren't shipped to
production):

```dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --system --uid 1001 nextjs
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

**Important nuance:** `NEXT_PUBLIC_*` variables are inlined into the
JS bundle **at build time**, not read at container startup. That means
they must be passed as Docker **build args** during the CI build step
(§6), not just as runtime env vars on the VPS — a common mistake that
silently ships a build pointed at the wrong (or no) Supabase project.

**`docker-compose.yml`** on the VPS (`/opt/volleyverse/`):

```yaml
services:
  app:
    image: ghcr.io/<org>/volleyverse:latest
    restart: unless-stopped
    expose:
      - "3000"
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

volumes:
  caddy_data:
```

**`Caddyfile`:**

```
yourdomain.com, www.yourdomain.com {
  redir https://yourdomain.com{uri} # if hit on www
  reverse_proxy app:3000
}
```

Caddy requests and renews the Let's Encrypt certificate automatically
the first time it starts — no manual TLS setup.

The VPS holds **no application data** — everything lives in Supabase.
That makes the box disposable: it can be destroyed and rebuilt from
this repo + secrets with zero data loss, which simplifies backups
considerably (see §8).

---

## 6. CI/CD (GitHub Actions)

Two triggers, one workflow file (`.github/workflows/deploy.yml`):

- **Pull request →** build + test only. This is the merge gate that
  doesn't exist today (see `CLAUDE.md` — currently nothing runs
  `npm run build`/`npm test` before merge).
- **Push to `main` →** build + test, then build the Docker image,
  push it to GitHub Container Registry (GHCR — free, uses the
  built-in `GITHUB_TOKEN`, no extra account needed), then SSH into
  the VPS and redeploy.

```yaml
name: Deploy
on:
  pull_request:
  push:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build
      - run: npm test

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: build-and-test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          build-args: |
            NEXT_PUBLIC_SUPABASE_URL=${{ secrets.SUPABASE_URL }}
            NEXT_PUBLIC_SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/volleyverse
            docker compose pull
            docker compose up -d --remove-orphans
            docker image prune -f
```

**GitHub repo secrets needed:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`VPS_HOST`, `VPS_SSH_KEY` (a deploy-only key, not your personal one).

**Rollback:** every image is tagged with its git SHA, so rolling back
is: SSH in, edit `docker-compose.yml`'s image tag to the previous SHA,
`docker compose up -d`. Worth scripting as a one-liner once this has
happened for real once.

**As the app grows:** add a `staging` environment as a second
Compose stack on the same VPS behind `staging.yourdomain.com` (cheap,
fine at this scale), and only split to a second VPS once staging
traffic or resource contention actually justifies it.

---

## 7. Supabase — plan, backups, and access

There is no backend server to provision for this app — Supabase (Postgres
+ RLS + auto-generated API + Realtime) *is* the backend (see `CLAUDE.md`).
Nothing here changes because of the frontend move; it's listed because
it's the one place "minimum budget" needs a deliberate decision before
real league data goes in, not an oversight to fix later.

**Check the current project tier first** (Supabase dashboard → Project
Settings → Billing). If it's on **Free**, two limits matter for a
production app:

- The project **auto-pauses after about a week with no API activity** —
  fine for a demo, not acceptable once real users depend on it staying up.
- Backup coverage is minimal/none, so accidental data loss (a bad
  migration, a mistaken bulk delete) has no safety net.

**Recommendation: upgrade to Pro (~$25/mo)** before this holds real
league/match data. That removes the auto-pause and adds daily backups
with several days of retention out of the box. If the budget can stretch
further later, Point-in-Time Recovery (PITR) is an optional add-on worth
revisiting once the league's data actually matters to people beyond the
team — it lets you restore to any point within a window, not just the
latest daily snapshot.

**Migrations, applied deliberately, not pasted in:**

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/*.sql in order
```

Treat `supabase/schema.sql` and `supabase/migrations/` the same way as
application code — changes go through a PR, get reviewed, then get
pushed with the CLI — rather than edited live in the SQL editor, which
leaves no record of what changed or why.

**Keys:** the anon key is meant to be public — RLS is the actual access
control, not key secrecy, so no special handling is needed for it beyond
what's already in `.env`/GitHub secrets (§5–6). If a **service-role**
key is ever introduced later (e.g. a CI script that needs to bypass RLS
for a migration), it must never appear in client code or a
`NEXT_PUBLIC_*` variable — only as a GitHub Actions secret, used
server-side/CI-side only.

---

## 8. Ongoing management

| Task | How |
| --- | --- |
| Uptime alerts | UptimeRobot free plan, pings the domain every 5 min, email/Slack on downtime |
| App logs | `docker compose logs -f` on the VPS; rotation already capped in compose (§5) |
| OS security patches | `unattended-upgrades`, installed in §4, runs unattended |
| TLS renewal | Automatic (Caddy) — no action needed |
| Domain renewal | Auto-renew at registrar — check the card on file yearly |
| Disk cleanup | `docker image prune -f` (already in the deploy script) |
| Data backups | Supabase's own backup/retention for your plan — see §7; **Pro tier is what actually makes this safe** |
| Disaster recovery | VPS is stateless — destroy and re-provision from this repo + secrets if it's ever compromised or misconfigured beyond easy repair |
| SSH key rotation | Periodically, and immediately if anyone with access leaves |

### Known gap carried into this plan, not solved by it

`/console` still has no authentication — anyone who reaches the
domain has full write access to the league (see `CLAUDE.md`). Moving
hosts doesn't change this. Worth resolving before or shortly after
this migration, not left indefinitely; there's a stale plan for it
already at
`docs/superpowers/plans/2026-07-27-console-login-supabase-auth.md`.

---

## 9. Order of operations

1. Buy the domain, point it at Cloudflare.
2. Provision the VPS, hardening steps from §4.
3. Add `output: "standalone"`, commit the `Dockerfile` / `docker-compose.yml` / `Caddyfile`.
4. Add the GitHub Actions workflow + repo secrets.
5. Confirm/upgrade the Supabase plan (§7) — do this now if real data is
   already going in on Vercel, don't wait for the rest of the migration.
6. Point Cloudflare's `A` record at the VPS IP once the app is confirmed running via `curl localhost:3000` on the box.
7. Push to `main`, watch the first automated deploy happen.
8. Decommission the Vercel project once the new domain has served correctly for a few days.
