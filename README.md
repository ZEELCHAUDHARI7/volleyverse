# VolleyVerse — Goa Guardians Console

Match analytics console for Goa Guardians (Prime Volleyball League).
Courtside stat entry, live charts, player profiles, match dashboards.

**v1 pilot build (local-first):** all data lives in your browser
(localStorage) — no account or internet needed after setup. It comes
pre-seeded with a 3-match demo season derived from the client's
reference Excel. Supabase backend plugs in behind the same data layer
in a later phase (see `src/lib/store.tsx`).

---

## Run it (from zero)

**1. Install Node.js (one time).**
Go to https://nodejs.org and install the **LTS** version. Accept all
defaults. Restart your terminal afterwards.

**2. Open a terminal in this folder.**
On Windows: open this folder in File Explorer, click the address bar,
type `cmd`, press Enter.

**3. Install the project's packages (one time, ~1 min):**

```
npm install
```

**4. Start the app:**

```
npm run dev
```

Open http://localhost:3000 — you'll land in the Console.

> OneDrive tip: if `npm install` is slow or flaky inside OneDrive,
> copy this folder somewhere outside OneDrive (e.g. `C:\dev\volleyverse`)
> and work there. `node_modules` and `.next` are git-ignored and should
> never be synced.

---

## What's inside

**Public Showcase (fan-facing, no login, published matches only):**

| Route | What it is |
|---|---|
| `/` | Cinematic home — hero, season count-up ticker, featured player, latest result |
| `/team` | Roster with role filters and public player cards |
| `/players/[id]` | Public player profile — hero stat card, trend, match log |
| `/matches` | Match reports list |
| `/matches/[id]` | Public match report — MVPs, team numbers, charts |

**Console (staff-facing):**

| Route | What it is |
|---|---|
| `/console` | Match Day home — live match, last-match summary, recent matches |
| `/console/matches/new` | Match setup (≤2 minutes, roster pre-selected) |
| `/console/matches/[id]/live` | **Live Entry** — 2-tap courtside stat entry with undo |
| `/console/matches/[id]` | Match Dashboard — MVPs, team vs previous, 4 charts, publish control |
| `/console/matches/[id]/review` | Post-match corrections (+/− any count) |
| `/console/players` | Roster with season stats |
| `/console/players/[id]` | Player profile — trend chart, match-by-match table |
| `/console/analytics` | Season analytics — all 5 charts + demo-data reset |

## Architecture notes (for future-you)

- **`src/lib/types.ts`** — domain model. `StatEvent` is the single
  source of truth; every displayed number is derived.
- **`src/lib/metrics.ts`** — all derived metrics (pure functions).
  ⚠ "Contribution Index" is a documented placeholder until the client
  signs off the real "Game Impact" formula.
- **`src/lib/store.tsx`** — the repository boundary. Swap
  localStorage → Supabase here; no screen changes needed.
- **`src/lib/seed.ts`** — deterministic demo season from the Excel.
- **`src/app/globals.css`** — the white-label layer. Club #2 =
  change the `--brand-*` variables, nothing else.

## Demo flow for the client pitch

1. Open `/console` — show the seeded season.
2. Create a new match (New Match → keep defaults → Start).
3. Tap a few stats in Live Entry — show the 2-tap flow and Undo.
4. End match → fix a count in Review → open the Match Dashboard.
5. Show charts updating, then the **Publish** control (private by default).
6. Players → Rohit Singh → trend chart ("is he improving?").
7. Open `/` — the public site. Publish/unpublish the Ahmedabad match in
   the Console and watch it appear/disappear from `/matches` — that's the
   publish boundary, live.

Planning reference: the full 8-phase product plan lives in the chat
session (vision, personas, IA, requirements, stack rationale, roadmap).
