# Console Login (Supabase Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the currently-open `/console` behind invite-only Supabase Auth magic-link sign-in, and move the lock into the database via RLS on all 18 tables.

**Architecture:** Session lives in a cookie (not localStorage) so the server can read it. `@supabase/ssr` supplies `createBrowserClient` (client components, realtime) and `createServerClient` (route handlers, middleware). A root `middleware.ts` refreshes the token and guards `/console/*` by validating the JWT signature with `getClaims()` — never `getSession()`. The guard no-ops when Supabase env vars are absent, so local dev stays open and the offline `LocalStoreProvider` path is unaffected.

**Tech Stack:** Next.js 15.5 (App Router), React 19, `@supabase/ssr` ^0.12.3, `@supabase/supabase-js` ^2.110.8, Postgres RLS.

## Global Constraints

- Add `@supabase/ssr` at `^0.12.3` (latest as of 2026-07-27). Keep `@supabase/supabase-js` — do NOT add the deprecated `@supabase/auth-helpers-*`.
- Env var names stay exactly `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not rename to `..._PUBLISHABLE_KEY`.
- Server-side auth checks use `supabase.auth.getClaims()`. `getSession()` is forbidden in middleware, route handlers, and server components — cookies are spoofable; only `getClaims()` verifies the JWT signature.
- The middleware guard must be inert unless BOTH env vars are set. Local dev without `.env.local` must behave exactly as it does today.
- The `(showcase)` route group — `/`, `/live`, `/matches`, `/players`, `/team` — must remain publicly readable and is never guarded.
- Sign-up is invite-only: every `signInWithOtp` call passes `shouldCreateUser: false`.
- v1 has a single implicit "staff" role — any authenticated user gets the full console. No `profiles` table, no role column.
- Cookie handling uses the `getAll`/`setAll` pair. The single-cookie `get`/`set`/`remove` API is removed in `@supabase/ssr` v0.12 and will break.
- Tests follow the existing zero-dependency pattern (`node --experimental-strip-types`, `node:assert/strict`). Do not introduce Vitest/Jest.

---

### Task 1: Supabase SSR clients

Swap the browser client to the cookie-based one and add a server client. Nothing is guarded yet — after this task the app behaves identically, but sessions are stored where the server can read them.

**Files:**
- Modify: `package.json:11-18` (dependencies)
- Modify: `src/lib/providers/supabase-client.ts:1-44`
- Create: `src/lib/providers/supabase-server.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isSupabaseConfigured(): boolean` — unchanged signature, re-exported from `supabase-client.ts`.
  - `getSupabase(): SupabaseClient | null` — unchanged signature, now cookie-backed.
  - `createSupabaseServerClient(): Promise<SupabaseClient | null>` from `supabase-server.ts` — returns `null` when unconfigured.

- [ ] **Step 1: Install the package**

```bash
npm install @supabase/ssr@^0.12.3
```

Expected: `package.json` dependencies gain `"@supabase/ssr": "^0.12.3"`.

- [ ] **Step 2: Swap the browser client to `createBrowserClient`**

Replace the whole of `src/lib/providers/supabase-client.ts` with:

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client — the single connection the realtime provider,
 * the live-state channel and Auth all share.
 *
 * Configuration is env-driven so the app degrades gracefully:
 *   - Both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set
 *     → cloud mode: Postgres source of truth + Realtime across all users.
 *   - Either missing → the app falls back to the offline-first
 *     LocalProvider (localStorage + cross-tab sync). Nothing throws.
 *
 * createBrowserClient persists the session in a cookie rather than
 * localStorage, which is what lets middleware and server components read
 * it. See src/middleware.ts and REALTIME_SYNC.md.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when both env vars are present — i.e. cloud realtime is available. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

let client: SupabaseClient | null = null;

/**
 * The shared browser client, or `null` when Supabase is not configured.
 * Memoised so every hook shares one websocket.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  client = createBrowserClient(url!, anonKey!, {
    realtime: {
      // Cap event rate so a fast courtside tapper can't flood subscribers.
      params: { eventsPerSecond: 20 },
    },
  });
  return client;
}
```

Note: `persistSession`/`autoRefreshToken` are dropped deliberately — `createBrowserClient` sets cookie-based persistence and refresh itself, and passing the old `auth` block overrides its storage adapter.

- [ ] **Step 3: Create the server client**

Create `src/lib/providers/supabase-server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Per-request Supabase client for route handlers and server components.
 * Never memoise this — each request carries its own cookies.
 *
 * Returns null when Supabase is unconfigured, mirroring getSupabase().
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Middleware refreshes the session, so this is safe to swallow.
        }
      },
    },
  });
}
```

- [ ] **Step 4: Verify the app still builds and runs unchanged**

```bash
npm run build
```

Expected: build succeeds. With no `.env.local` present, `isSupabaseConfigured()` is false and the app still uses `LocalStoreProvider` — visit `/console` and confirm it loads as before.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/providers/supabase-client.ts src/lib/providers/supabase-server.ts
git commit -m "feat(auth): add @supabase/ssr cookie-based browser and server clients"
```

---

### Task 2: Route guard predicate + middleware

The guard decision is pure logic, so it gets a real test. The middleware wires that predicate to `getClaims()`.

**Files:**
- Create: `src/lib/auth-routes.ts`
- Create: `src/lib/auth-routes.test.mjs`
- Create: `src/middleware.ts`
- Modify: `package.json:9` (test script)

**Interfaces:**
- Consumes: `createSupabaseServerClient` is NOT used here — middleware builds its own client from the request/response pair.
- Produces:
  - `PUBLIC_CONSOLE_ROUTES: readonly string[]`
  - `requiresAuth(pathname: string): boolean` — true only for `/console/*` paths that are not sign-in plumbing.
  - `LOGIN_PATH = "/console/login"`, `CALLBACK_PATH = "/console/auth/callback"`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth-routes.test.mjs`:

```js
/**
 * Route-guard predicate tests. Run:
 *   node --experimental-strip-types src/lib/auth-routes.test.mjs
 * No test framework — tiny asserts, zero deps, same style as rally.test.mjs.
 */
import assert from "node:assert/strict";
import { requiresAuth, LOGIN_PATH, CALLBACK_PATH } from "./auth-routes.ts";

let passed = 0;
function check(label, actual, expected) {
  assert.equal(actual, expected, label);
  passed += 1;
}

// Console routes are guarded.
check("console root", requiresAuth("/console"), true);
check("console dashboard sub", requiresAuth("/console/league"), true);
check("console nested", requiresAuth("/console/matches/new"), true);
check("console analytics", requiresAuth("/console/analytics"), true);

// Sign-in plumbing must be reachable while signed out, or we loop forever.
check("login page", requiresAuth(LOGIN_PATH), false);
check("callback route", requiresAuth(CALLBACK_PATH), false);
check("callback with suffix", requiresAuth(`${CALLBACK_PATH}/`), false);

// The public showcase is never guarded.
check("home", requiresAuth("/"), false);
check("live", requiresAuth("/live"), false);
check("public matches", requiresAuth("/matches"), false);
check("players", requiresAuth("/players"), false);
check("team", requiresAuth("/team"), false);

// A path that merely starts with the same letters is not the console.
check("console-lookalike", requiresAuth("/consoles"), false);
check("console-lookalike deep", requiresAuth("/console-x/y"), false);

console.log(`auth-routes: ${passed} checks passed`);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
node --experimental-strip-types src/lib/auth-routes.test.mjs
```

Expected: FAIL — `Cannot find module .../auth-routes.ts`.

- [ ] **Step 3: Write the predicate**

Create `src/lib/auth-routes.ts`:

```ts
/**
 * Which paths the auth middleware guards. Pure string logic, kept out of
 * middleware.ts so it can be tested without a Next.js request.
 */

export const CONSOLE_PREFIX = "/console";
export const LOGIN_PATH = "/console/login";
export const CALLBACK_PATH = "/console/auth/callback";

/** Console paths reachable while signed out — the sign-in plumbing itself. */
export const PUBLIC_CONSOLE_ROUTES: readonly string[] = [
  LOGIN_PATH,
  CALLBACK_PATH,
];

/**
 * True when `pathname` is a console route that demands a session.
 * Everything outside /console (the public showcase) is always false.
 */
export function requiresAuth(pathname: string): boolean {
  const isConsole =
    pathname === CONSOLE_PREFIX || pathname.startsWith(`${CONSOLE_PREFIX}/`);
  if (!isConsole) return false;
  return !PUBLIC_CONSOLE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
node --experimental-strip-types src/lib/auth-routes.test.mjs
```

Expected: PASS — `auth-routes: 13 checks passed`.

- [ ] **Step 5: Wire the new test into `npm test`**

In `package.json`, replace line 9:

```json
    "test": "node --experimental-strip-types src/lib/rally.test.mjs && node --experimental-strip-types src/lib/auth-routes.test.mjs"
```

Run `npm test` — expected: both suites pass.

- [ ] **Step 6: Write the middleware**

Create `src/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, requiresAuth } from "@/lib/auth-routes";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Refreshes the Supabase auth cookie on every matched request and gates
 * /console/* behind a verified session.
 *
 * When Supabase is unconfigured the middleware is a pass-through, so local
 * development against the offline LocalStoreProvider is never locked out.
 */
export async function middleware(request: NextRequest) {
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims() verifies the JWT signature against the project's published
  // keys. Never use getSession() here — its cookie payload is spoofable.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && requiresAuth(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = LOGIN_PATH;
    redirectUrl.search = "";
    redirectUrl.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image files. The console gate
     * itself is decided by requiresAuth(); matching more broadly than that
     * is deliberate, so the session cookie is refreshed site-wide.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
```

- [ ] **Step 7: Verify the unconfigured path is still open**

```bash
npm run build && npm run dev
```

With no `.env.local`: visit `http://localhost:3000/console` — expected: dashboard loads, NO redirect to `/console/login`. Visit `/` — expected: showcase loads.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth-routes.ts src/lib/auth-routes.test.mjs src/middleware.ts package.json
git commit -m "feat(auth): guard /console behind verified session in middleware"
```

---

### Task 3: Magic-link sign-in page

**Files:**
- Create: `src/app/console/login/page.tsx`

**Interfaces:**
- Consumes: `getSupabase()`, `isSupabaseConfigured()` from `@/lib/providers/supabase-client`; `CALLBACK_PATH` from `@/lib/auth-routes`; `Button`, `Card` from `@/components/ui`.
- Produces: the route `/console/login`. Sends users to `CALLBACK_PATH` with a `next` param.

Note: `/console/login` renders inside `src/app/console/layout.tsx`, so it already gets the console shell, `ConsoleNav` and `StoreProvider`. No layout change needed.

- [ ] **Step 1: Write the page**

Create `src/app/console/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button, Card } from "@/components/ui";
import { getSupabase, isSupabaseConfigured } from "@/lib/providers/supabase-client";
import { CALLBACK_PATH } from "@/lib/auth-routes";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/console";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function sendLink() {
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "Enter your email address." });
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setStatus({
        kind: "error",
        message: "Supabase is not configured for this deployment.",
      });
      return;
    }

    setStatus({ kind: "sending" });
    const redirect = new URL(CALLBACK_PATH, window.location.origin);
    redirect.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        // Invite-only: never create an account from the sign-in form.
        shouldCreateUser: false,
        emailRedirectTo: redirect.toString(),
      },
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    setStatus({ kind: "sent", email: trimmed });
  }

  if (!isSupabaseConfigured()) {
    return (
      <Card className="mx-auto mt-16 max-w-md">
        <h1 className="stat-display text-lg font-extrabold uppercase tracking-widest text-ink">
          Console sign-in
        </h1>
        <p className="mt-3 text-sm text-dim">
          This deployment runs in offline mode — no sign-in required. Open the{" "}
          <a className="text-accent underline" href="/console">
            console
          </a>{" "}
          directly.
        </p>
      </Card>
    );
  }

  if (status.kind === "sent") {
    return (
      <Card className="mx-auto mt-16 max-w-md">
        <h1 className="stat-display text-lg font-extrabold uppercase tracking-widest text-ink">
          Check your email
        </h1>
        <p className="mt-3 text-sm text-dim">
          We sent a sign-in link to{" "}
          <span className="font-semibold text-ink">{status.email}</span>. Open
          it on this device to enter the console.
        </p>
        <p className="mt-4 text-xs text-dim">
          Nothing arrived? The console is invite-only — if this address has not
          been invited, no link is sent. Ask a league admin to invite you.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto mt-16 max-w-md">
      <h1 className="stat-display text-lg font-extrabold uppercase tracking-widest text-ink">
        Console sign-in
      </h1>
      <p className="mt-2 text-sm text-dim">
        Staff only. Enter your invited email and we&rsquo;ll send a one-tap
        sign-in link.
      </p>

      <label
        htmlFor="email"
        className="mt-6 block text-xs font-bold uppercase tracking-wider text-dim"
      >
        Email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void sendLink();
        }}
        placeholder="you@league.org"
        className="mt-2 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-dim focus:border-accent/60"
      />

      {status.kind === "error" && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {status.message}
        </p>
      )}

      <Button
        onClick={() => void sendLink()}
        disabled={status.kind === "sending"}
        className="mt-5 w-full"
      >
        {status.kind === "sending" ? "Sending…" : "Send sign-in link"}
      </Button>
    </Card>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify it renders**

```bash
npm run build && npm run dev
```

Visit `http://localhost:3000/console/login` — expected (no `.env.local`): the offline-mode card. Confirm no console errors and the page inherits the console nav/backdrop.

If `text-danger` is not a class in this codebase, substitute the existing error colour used elsewhere — check `src/components/ui.tsx` for the danger button token and reuse that text colour.

- [ ] **Step 3: Commit**

```bash
git add src/app/console/login/page.tsx
git commit -m "feat(auth): add magic-link console sign-in page"
```

---

### Task 4: Auth callback route

Handles both link formats: `token_hash` + `verifyOtp` (Supabase's recommended SSR magic-link flow) and `code` + `exchangeCodeForSession` (PKCE). Supporting both means the flow works whether or not the email template has been switched to `{{ .TokenHash }}`.

**Files:**
- Create: `src/app/console/auth/callback/route.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient()` from Task 1; `LOGIN_PATH` from Task 2.
- Produces: the route `/console/auth/callback`. On success redirects to `next` (default `/console`); on failure redirects to `/console/login?error=...`.

- [ ] **Step 1: Write the route handler**

Create `src/app/console/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/providers/supabase-server";
import { LOGIN_PATH } from "@/lib/auth-routes";

/**
 * Magic-link landing route. Accepts either shape of Supabase email link:
 *
 *   ?token_hash=…&type=email   → verifyOtp   (recommended SSR flow)
 *   ?code=…                    → exchangeCodeForSession (PKCE flow)
 *
 * Either way the session is written to cookies before we redirect on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = searchParams.get("next") ?? "/console";
  // Only allow same-origin relative redirects — never bounce to an
  // attacker-supplied absolute URL.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/console";

  const fail = (message: string) => {
    const url = new URL(LOGIN_PATH, origin);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url);
  };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("Supabase is not configured.");

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(error.message);
    return NextResponse.redirect(new URL(safeNext, origin));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
    return NextResponse.redirect(new URL(safeNext, origin));
  }

  return fail("That sign-in link is invalid or has expired.");
}
```

- [ ] **Step 2: Surface the error param on the login page**

In `src/app/console/login/page.tsx`, inside `LoginForm`, immediately after the `const next = ...` line, add:

```tsx
  const linkError = params.get("error");
```

Then, directly above the `<label htmlFor="email"` element, add:

```tsx
      {linkError && status.kind === "idle" && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {linkError}
        </p>
      )}
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: build succeeds, `/console/auth/callback` appears in the route list as a dynamic route.

- [ ] **Step 4: Commit**

```bash
git add src/app/console/auth/callback/route.ts src/app/console/login/page.tsx
git commit -m "feat(auth): add magic-link callback route for token_hash and PKCE flows"
```

---

### Task 5: Signed-in identity and sign-out in the console nav

**Files:**
- Modify: `src/app/console/console-nav.tsx:1-57`

**Interfaces:**
- Consumes: `getSupabase()`, `isSupabaseConfigured()`; `LOGIN_PATH` from Task 2.
- Produces: no exports beyond the existing `ConsoleNav`.

- [ ] **Step 1: Add the account block**

In `src/app/console/console-nav.tsx`, replace the import block at lines 1-4 with:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/providers/supabase-client";
import { LOGIN_PATH } from "@/lib/auth-routes";
```

Add this component directly above `export function ConsoleNav()`:

```tsx
/** Signed-in email + sign-out. Renders nothing in offline mode. */
function AccountControls() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setEmail(session?.user.email ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured() || !email) return null;

  async function signOut() {
    await getSupabase()?.auth.signOut();
    router.replace(LOGIN_PATH);
    router.refresh();
  }

  return (
    <div className="ml-2 flex items-center gap-2 border-l border-line pl-2">
      <span
        title={email}
        className="hidden max-w-[12rem] truncate text-xs font-semibold text-dim sm:block"
      >
        {email}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-lg border border-line px-3 py-2 text-xs font-bold uppercase tracking-wider text-dim transition-colors hover:border-accent/40 hover:text-ink"
      >
        Sign out
      </button>
    </div>
  );
}
```

Then, inside `ConsoleNav`, insert `<AccountControls />` immediately after the closing `</Link>` of the "Public site ↗" link (currently line 52), still inside the `ml-auto` flex container.

- [ ] **Step 2: Hide the nav links on the login page**

Still in `ConsoleNav`, add after the `const pathname = usePathname();` line:

```tsx
  const onLoginPage = pathname === LOGIN_PATH;
```

Then wrap the `{LINKS.map(...)}` expression so it reads:

```tsx
          {!onLoginPage &&
            LINKS.map((l) => (
```

(keep the existing `<Link>` body and close with `))}`).

- [ ] **Step 3: Verify**

```bash
npm run build && npm run dev
```

Expected with no `.env.local`: nav renders exactly as before, no email, no Sign out button. Visit `/console/login` — expected: section links hidden, brand mark and "Public site ↗" still present.

- [ ] **Step 4: Commit**

```bash
git add src/app/console/console-nav.tsx
git commit -m "feat(auth): show signed-in email and sign-out in console nav"
```

---

### Task 6: RLS hardening across the remaining 14 tables

Today only `matches`, `stat_events`, `match_sets` and `match_live_state` have RLS. The other 14 tables are writable by anyone holding the public anon key. This task moves the lock into Postgres.

**Files:**
- Modify: `supabase/schema.sql` (append a new section at end of file)

**Interfaces:**
- Consumes: the existing `auth.role() = 'authenticated'` convention from `schema.sql:287-327`.
- Produces: RLS enabled on all 18 tables; `security_invoker` set on all 3 views.

- [ ] **Step 1: Append the hardening section**

Append to the end of `supabase/schema.sql`:

```sql
-- =====================================================================
-- RLS HARDENING — the remaining reference tables
-- =====================================================================
-- matches / stat_events / match_sets / match_live_state are already
-- policied above (the publish boundary). Everything else is league
-- reference data: publicly readable (the showcase site renders it
-- anonymously) and writable only by authenticated staff. This is what
-- makes the console lock real — without it the public anon key can write
-- straight past the UI.

alter table leagues            enable row level security;
alter table seasons            enable row level security;
alter table divisions          enable row level security;
alter table venues             enable row level security;
alter table courts             enable row level security;
alter table tournaments        enable row level security;
alter table tournament_groups  enable row level security;
alter table teams              enable row level security;
alter table team_honours       enable row level security;
alter table staff              enable row level security;
alter table players            enable row level security;
alter table team_players       enable row level security;
alter table match_officials    enable row level security;
alter table match_rosters      enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'leagues','seasons','divisions','venues','courts','tournaments',
    'tournament_groups','teams','team_honours','staff','players',
    'team_players','match_officials','match_rosters'
  ] loop
    execute format(
      'create policy "public reads %1$s" on %1$I for select using (true)', t);
    execute format(
      'create policy "staff writes %1$s" on %1$I for all '
      'using (auth.role() = ''authenticated'') '
      'with check (auth.role() = ''authenticated'')', t);
  end loop;
end $$;

-- Views bypass RLS unless they run as the caller. Without this, the
-- publish boundary on matches/stat_events leaks through match_statistics
-- and standings.
alter view roster_view       set (security_invoker = true);
alter view match_statistics  set (security_invoker = true);
alter view standings         set (security_invoker = true);
```

- [ ] **Step 2: Apply it to the Supabase project**

In the Supabase dashboard → SQL Editor, run the appended section only (the tables above already exist). Expected: `Success. No rows returned`.

If a policy name already exists, the statement errors — drop the conflicting policy and re-run rather than renaming.

- [ ] **Step 3: Verify anon writes are refused**

In the SQL Editor run:

```sql
set local role anon;
insert into teams (name) values ('rls probe');
```

Expected: `new row violates row-level security policy for table "teams"`.

Then confirm reads still work:

```sql
set local role anon;
select count(*) from teams;
```

Expected: succeeds.

- [ ] **Step 4: Verify the public showcase still renders**

With env vars set, load `/`, `/team`, `/players`, `/matches` signed out. Expected: all content renders. If anything is empty, a `for select using (true)` policy is missing on the table feeding it.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(auth): enable RLS on all reference tables and views"
```

---

### Task 7: Phase 0 — project configuration and end-to-end verification

Human/dashboard steps. Nothing here is code, but the feature is not done until these pass.

**Files:**
- Create: `.env.local` (gitignored — never commit)
- Create: `.env.local.example`

- [ ] **Step 1: Create the local env file**

```bash
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EOF
```

Confirm `.env.local` is gitignored: `git check-ignore -v .env.local` must print a match.

- [ ] **Step 2: Commit a template for the next developer**

```bash
cat > .env.local.example <<'EOF'
# Cloud mode: set both to enable Supabase (Postgres + Realtime + console auth).
# Leave unset for offline localStorage mode — the console stays unguarded.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
EOF
git add .env.local.example
git commit -m "docs(auth): add .env.local.example"
```

- [ ] **Step 3: Confirm the schema is applied**

Supabase dashboard → Table Editor. Expected: all 18 tables plus the `match_statistics`, `standings` and `roster_view` views. If missing, run the whole of `supabase/schema.sql` in the SQL Editor first.

- [ ] **Step 4: Configure Auth**

Supabase dashboard → Authentication:
- Providers → Email: enabled. Turn OFF "Confirm email" is NOT required; leave defaults.
- Providers → Email → **disable "Allow new users to sign up"**. This is what makes it invite-only.
- URL Configuration → Site URL: `https://volleyverse-i3ba.vercel.app`
- URL Configuration → Redirect URLs, add both:
  - `http://localhost:3000/console/auth/callback`
  - `https://volleyverse-i3ba.vercel.app/console/auth/callback`
- Email Templates → Magic Link: replace the link with

```html
<a href="{{ .SiteURL }}/console/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/console">Sign in to the console</a>
```

- [ ] **Step 5: Invite the staff users**

Authentication → Users → Invite user. Enter each staff email. Expected: user appears with "Invited" status.

- [ ] **Step 6: Add the env vars to Vercel**

Vercel → Project → Settings → Environment Variables. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to **Production and Preview**. Redeploy.

- [ ] **Step 7: End-to-end verification**

Run `npm run dev` with `.env.local` populated, then:

1. Open `/console` signed out → expected: redirect to `/console/login?next=%2Fconsole`.
2. Enter an **uninvited** email → send → expected: the "Check your email" card, but NO email arrives (invite-only working). Supabase may also return a signup-disabled error; either is a pass.
3. Enter an **invited** email → send → open the emailed link → expected: land on `/console`, nav shows your email and a Sign out button.
4. Deep link: sign out, open `/console/analytics` → expected: redirect to login with `next=%2Fconsole%2Fanalytics`; after sign-in you land on `/console/analytics`, not `/console`.
5. Click Sign out → expected: back at `/console/login`; re-entering `/console` redirects again.
6. Signed out, visit `/`, `/live`, `/matches`, `/players`, `/team` → expected: all load fully.
7. Signed in, score a rally in a live match with a second browser watching `/live` → expected: realtime still propagates (confirms the `createBrowserClient` swap did not break the websocket).
8. Repeat 1, 3 and 6 against the deployed Vercel URL.

- [ ] **Step 8: Final commit and branch handoff**

```bash
npm test && npm run build
git status
```

Expected: tests pass, build succeeds, working tree clean.

---

## Self-Review

**Spec coverage** — every row of the design doc's file-change map maps to a task: `supabase-client.ts` (T1), `supabase-server.ts` (T1), `middleware.ts` (T2), `console/login/page.tsx` (T3), `console/auth/callback/route.ts` (T4), `console-nav.tsx` (T5), `schema.sql` (T6), `package.json` (T1+T2). Phase 0 is T7. Both reconfirmed decisions are honoured: single staff role (no `profiles` table anywhere in the plan) and RLS hardening across all tables (T6).

**Type consistency** — `requiresAuth`, `LOGIN_PATH`, `CALLBACK_PATH`, `CONSOLE_PREFIX` and `PUBLIC_CONSOLE_ROUTES` are defined in T2 and used with identical names in T2/T3/T4/T5. `createSupabaseServerClient()` is defined in T1 and consumed in T4 with the same `Promise<SupabaseClient | null>` return. `getSupabase()`/`isSupabaseConfigured()` keep their existing signatures, so `supabase-store.ts` and `live-state.ts` need no edits.

**Known deviations from the skill's defaults, called out deliberately:**
- Only Task 2 is genuinely test-first. The rest is React/route-handler/SQL work with no test framework in this repo; adding Vitest to enable it would be a larger, unrequested change. Verification for those tasks is `npm run build` plus the scripted manual checks in T7 Step 7.
- T7 depends on credentials and dashboard access the implementer may not have. Tasks 1–6 are fully executable without them; T7 is the gate before calling the feature done.
