/**
 * Route-guard predicate tests. Run:
 *   node --experimental-strip-types src/lib/auth-routes.test.mjs
 * No test framework — tiny asserts, zero deps, same style as rally.test.mjs.
 */
import assert from "node:assert/strict";
import {
  requiresAuth,
  gatesWhenUnconfigured,
  LOGIN_PATH,
  CALLBACK_PATH,
} from "./auth-routes.ts";

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
check("console rally", requiresAuth("/console/matches/abc-123/rally"), true);

// Sign-in plumbing must be reachable while signed out, or we loop forever.
check("login page", requiresAuth(LOGIN_PATH), false);
check("callback route", requiresAuth(CALLBACK_PATH), false);
check("callback with trailing slash", requiresAuth(`${CALLBACK_PATH}/`), false);

// The public showcase is never guarded.
check("home", requiresAuth("/"), false);
check("live", requiresAuth("/live"), false);
check("public matches", requiresAuth("/matches"), false);
check("public match detail", requiresAuth("/matches/abc-123"), false);
check("players", requiresAuth("/players"), false);
check("team", requiresAuth("/team"), false);

// A path that merely starts with the same letters is not the console.
check("console-lookalike", requiresAuth("/consoles"), false);
check("console-lookalike deep", requiresAuth("/console-x/y"), false);

// Nor is a path that merely starts with the login path's letters.
check("login-lookalike is guarded", requiresAuth("/console/loginx"), true);

// --- Missing Supabase env vars must not silently unguard the console. ---
// A Vercel deploy shipped without NEXT_PUBLIC_SUPABASE_* once, and the
// middleware's pass-through left /console open to the public internet.

// In production a misconfiguration gates the console instead of opening it.
check("unconfigured prod: console root", gatesWhenUnconfigured("/console", true), true);
check("unconfigured prod: console nested", gatesWhenUnconfigured("/console/matches/new", true), true);

// ...but never the sign-in plumbing, or the redirect loops forever.
check("unconfigured prod: login page", gatesWhenUnconfigured(LOGIN_PATH, true), false);
check("unconfigured prod: callback", gatesWhenUnconfigured(CALLBACK_PATH, true), false);

// The public showcase stays reachable even when misconfigured.
check("unconfigured prod: home", gatesWhenUnconfigured("/", true), false);
check("unconfigured prod: live", gatesWhenUnconfigured("/live", true), false);

// Offline local dev against LocalStoreProvider keeps its escape hatch.
check("unconfigured dev: console root", gatesWhenUnconfigured("/console", false), false);
check("unconfigured dev: console nested", gatesWhenUnconfigured("/console/matches/new", false), false);

console.log(`auth-routes: ${passed} checks passed`);
