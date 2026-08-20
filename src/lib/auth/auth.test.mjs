/**
 * Route-guard and form-validation tests, plus the fan display-name/
 * initials helpers. Run:
 *   node --experimental-strip-types src/lib/auth/auth.test.mjs
 * No test framework. Tiny asserts, zero deps, same style as rally.test.mjs.
 *
 * What isn't here: anything that calls Supabase. temporary-auth.ts and
 * temporary-fan-auth.ts are thin wrappers over supabase.auth.* now —
 * there's no pure logic left in them worth asserting on without a live
 * (or mocked) network call, which this zero-dependency runner doesn't
 * do. Console-admin allowlisting and the RLS policies that enforce it
 * are server-side SQL and are verified manually (see the migration's
 * own smoke test and REALTIME_SYNC.md), not by this file.
 */
import assert from "node:assert/strict";
import {
  requiresAuth,
  requiresAccount,
  isAuthPage,
  safeNext,
  buildCallbackUrl,
  LOGIN_PATH,
  APP_HOME,
  PUBLIC_HOME,
  FAN_SIGN_IN_PATH,
  FAN_JOIN_PATH,
  AUTH_CALLBACK_PATH,
} from "./routes.ts";
import { fanDisplayName, fanInitials } from "./temporary-fan-auth.ts";
import {
  validateEmail,
  validatePassword,
  validateName,
  validateLogin,
  validateSignUp,
  passwordStrength,
  hasErrors,
} from "./validation.ts";

let passed = 0;
function check(label, actual, expected) {
  assert.equal(actual, expected, label);
  passed += 1;
}
function deep(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  passed += 1;
}

// --- Staff gate: the console needs a console session. ---
check("console root", requiresAuth("/console"), true);
check("console league", requiresAuth("/console/league"), true);
check("console nested", requiresAuth("/console/matches/new"), true);
check("console rally", requiresAuth("/console/matches/abc-123/rally"), true);

check("home", requiresAuth("/"), false);
check("live", requiresAuth("/live"), false);
check("public matches", requiresAuth("/matches"), false);
check("public match detail", requiresAuth("/matches/abc-123"), false);
check("players", requiresAuth("/players"), false);
check("team", requiresAuth("/team"), false);

// The account pages must never be gated, or the redirects loop forever.
check("login page not staff-gated", requiresAuth(LOGIN_PATH), false);
check("login is an account page", isAuthPage(LOGIN_PATH), true);
check("fan sign-in is an account page", isAuthPage(FAN_SIGN_IN_PATH), true);
check("fan join is an account page", isAuthPage(FAN_JOIN_PATH), true);
check("home is not an account page", isAuthPage("/"), false);
check("console is not an account page", isAuthPage("/console"), false);

// --- Account gate: every other page needs an account of either kind. ---
check("home needs an account", requiresAccount("/"), true);
check("live needs an account", requiresAccount("/live"), true);
check("matches needs an account", requiresAccount("/matches"), true);
check("match detail needs an account", requiresAccount("/matches/abc-123"), true);
check("players needs an account", requiresAccount("/players/abc"), true);
check("teams needs an account", requiresAccount("/team"), true);

// The console has its own stricter gate, so it is not double-counted.
check("console excluded from account gate", requiresAccount("/console"), false);
check("console nested excluded", requiresAccount("/console/league"), false);

// Account pages stay open to everyone.
check("login open", requiresAccount(LOGIN_PATH), false);
check("fan sign-in open", requiresAccount(FAN_SIGN_IN_PATH), false);
check("fan join open", requiresAccount(FAN_JOIN_PATH), false);

// Lookalike prefixes are not the console.
check("console-lookalike", requiresAuth("/consoles"), false);
check("console-lookalike deep", requiresAuth("/console-x/y"), false);

// --- ?next= sanitising: same-origin relative paths only. ---
check("next passthrough", safeNext("/console/league"), "/console/league");
check("next with query", safeNext("/console/matches?f=live"), "/console/matches?f=live");
check("next missing", safeNext(null), APP_HOME);
check("next empty", safeNext(""), APP_HOME);
check("next absolute url", safeNext("https://evil.example/x"), APP_HOME);
check("next protocol-relative", safeNext("//evil.example"), APP_HOME);
check("next bare word", safeNext("console"), APP_HOME);
check("next back to login", safeNext(LOGIN_PATH), APP_HOME);
check("next login with query", safeNext(`${LOGIN_PATH}?x=1`), APP_HOME);

// Fan flows pass their own fallback, and never bounce back to an account page.
check("fan next passthrough", safeNext("/matches/abc", PUBLIC_HOME), "/matches/abc");
check("fan next missing", safeNext(null, PUBLIC_HOME), PUBLIC_HOME);
check("fan next to sign-in loops home", safeNext(FAN_SIGN_IN_PATH, PUBLIC_HOME), PUBLIC_HOME);
check("fan next to join loops home", safeNext(FAN_JOIN_PATH, PUBLIC_HOME), PUBLIC_HOME);
check(
  "fan next to join with query loops home",
  safeNext(`${FAN_JOIN_PATH}?next=/x`, PUBLIC_HOME),
  PUBLIC_HOME,
);
check("fan next offsite", safeNext("https://evil.example", PUBLIC_HOME), PUBLIC_HOME);

// --- Callback URL builder: always the shared route, next always encoded. ---
check(
  "callback url shape",
  buildCallbackUrl("http://localhost:3000", APP_HOME),
  `http://localhost:3000${AUTH_CALLBACK_PATH}?next=%2Fconsole`,
);
check(
  "callback url encodes next",
  buildCallbackUrl("http://localhost:3000", "/matches?f=live"),
  `http://localhost:3000${AUTH_CALLBACK_PATH}?next=%2Fmatches%3Ff%3Dlive`,
);

// --- Field validation. ---
check("email required", validateEmail("  "), "Enter your email address.");
check("email malformed", validateEmail("nope"), "That doesn't look like a valid email.");
check("email no tld", validateEmail("a@b"), "That doesn't look like a valid email.");
check("email valid", validateEmail("coach@league.org"), undefined);
check("email trims", validateEmail("  coach@league.org  "), undefined);

check("password required", validatePassword(""), "Enter your password.");
check(
  "password too short",
  validatePassword("short"),
  "Password must be at least 8 characters.",
);
check("password valid", validatePassword("longenough"), undefined);

check("valid pair has no errors", hasErrors(validateLogin("c@l.org", "password1")), false);
check("empty pair has errors", hasErrors(validateLogin("", "")), true);
deep("both fields reported", Object.keys(validateLogin("", "")), ["email", "password"]);

// --- Fan display helpers: pure, still used to render user_metadata.name. ---
check("fan sign-in not staff-gated", requiresAuth(FAN_SIGN_IN_PATH), false);
check("fan join not staff-gated", requiresAuth(FAN_JOIN_PATH), false);

check("fan name from email underscores", fanDisplayName("", "match_ops@example.com"), "Match Ops");
check("fan name from email plain", fanDisplayName("", "coach@example.com"), "Coach");
check("fan name from email empty local", fanDisplayName("", "@example.com"), "Fan");
check("fan name prefers given name", fanDisplayName(" Ana Rivera ", "a@b.org"), "Ana Rivera");
check("fan initials two words", fanInitials("Ana Rivera"), "AR");
check("fan initials one word", fanInitials("Ana"), "AN");
check("fan initials three words", fanInitials("Ana Maria Rivera"), "AR");
check("fan initials empty", fanInitials("   "), "F");

// --- Sign-up validation. ---
check("name required", validateName("  "), "Enter your name.");
check("name too short", validateName("A"), "That name looks too short.");
check("name valid", validateName("Ana"), undefined);
check("signup all bad", hasErrors(validateSignUp("", "", "")), true);
deep("signup reports every field", Object.keys(validateSignUp("", "", "")), [
  "name",
  "email",
  "password",
]);
check("signup valid", hasErrors(validateSignUp("Ana", "a@b.org", "password1")), false);

// --- Strength meter is advisory, never blocking. ---
check("strength empty", passwordStrength("").score, 0);
check("strength short", passwordStrength("abc").score, 0);
check("strength eight lower", passwordStrength("abcdefgh").score, 1);
check("strength mixed case", passwordStrength("Abcdefgh").score, 2);
check("strength long mixed digits", passwordStrength("Abcdefghij12").score, 4);
check("strength caps at four", passwordStrength("Abcdefghij12!@#$").score, 4);
check("strength label", passwordStrength("Abcdefghij12").label, "Strong");

console.log(`auth: ${passed} checks passed`);
