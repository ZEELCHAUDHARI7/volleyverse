/**
 * Route-guard, session-encoding and form-validation tests. Run:
 *   node --experimental-strip-types src/lib/auth/auth.test.mjs
 * No test framework. Tiny asserts, zero deps, same style as rally.test.mjs.
 */
import assert from "node:assert/strict";
import {
  requiresAuth,
  requiresAccount,
  isAuthPage,
  safeNext,
  LOGIN_PATH,
  APP_HOME,
  PUBLIC_HOME,
  FAN_SIGN_IN_PATH,
  FAN_JOIN_PATH,
} from "./routes.ts";
import {
  buildTemporaryUser,
  displayNameFromEmail,
  encodeSession,
  decodeSession,
  SESSION_COOKIE,
} from "./temporary-auth.ts";
import {
  FAN_COOKIE,
  buildTemporaryFan,
  decodeFan,
  encodeFan,
  fanDisplayName,
  fanInitials,
} from "./temporary-fan-auth.ts";
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

// --- Temporary user shape: minimal, derived, no invented fields. ---
deep("temp user", buildTemporaryUser("  Ana.Rivera@League.org "), {
  id: "temp-user",
  email: "ana.rivera@league.org",
  name: "Ana Rivera",
  role: "admin",
});
check("display name underscores", displayNameFromEmail("match_ops"), "Match Ops");
check("display name plain", displayNameFromEmail("coach"), "Coach");
check("display name empty", displayNameFromEmail("@league.org"), "League Staff");

// --- Session cookie round-trip. ---
const user = buildTemporaryUser("coach@league.org");
deep("encode/decode round-trip", decodeSession(encodeSession(user)), user);
check("decode empty", decodeSession(""), null);
check("decode undefined", decodeSession(undefined), null);
check("decode garbage", decodeSession("not-json"), null);
check("decode wrong shape", decodeSession(encodeURIComponent('{"a":1}')), null);

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

// --- Fan sessions: separate cookie, never a console key. ---
check("fan sign-in not staff-gated", requiresAuth(FAN_SIGN_IN_PATH), false);
check("fan join not staff-gated", requiresAuth(FAN_JOIN_PATH), false);
check("fan cookie differs from staff", FAN_COOKIE === SESSION_COOKIE, false);

deep("fan from name and email", buildTemporaryFan("  Ana.Rivera@Example.com ", " Ana Rivera "), {
  id: "temp-fan",
  email: "ana.rivera@example.com",
  name: "Ana Rivera",
});
deep("fan falls back to email", buildTemporaryFan("match_ops@example.com"), {
  id: "temp-fan",
  email: "match_ops@example.com",
  name: "Match Ops",
});
check("fan name fallback empty", fanDisplayName("", "@example.com"), "Fan");
check("fan initials two words", fanInitials("Ana Rivera"), "AR");
check("fan initials one word", fanInitials("Ana"), "AN");
check("fan initials three words", fanInitials("Ana Maria Rivera"), "AR");
check("fan initials empty", fanInitials("   "), "F");

const fan = buildTemporaryFan("fan@example.com", "Sam Fan");
deep("fan cookie round-trip", decodeFan(encodeFan(fan)), fan);
check("fan decode garbage", decodeFan("not-json"), null);
check("fan decode empty", decodeFan(""), null);

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
