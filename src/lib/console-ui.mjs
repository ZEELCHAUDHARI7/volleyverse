/**
 * console-ui.mjs — premium terminal renderer for the VolleyVerse QA Agent.
 * Zero dependencies. Pure presentation: no test logic lives here.
 *
 * Renders: banner, grouped suites, numbered steps, status badges,
 * per-step timings, and a boxed execution summary with statistics.
 */

const TTY = process.stdout.isTTY || process.env.FORCE_COLOR;
const c = (code) => (s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const paint = {
  dim: c("2"),
  bold: c("1"),
  red: c("31"),
  green: c("32"),
  yellow: c("33"),
  blue: c("34"),
  magenta: c("35"),
  cyan: c("36"),
  gray: c("90"),
  bgGreen: c("42;30"),
  bgRed: c("41;97"),
  bgYellow: c("43;30"),
  bgBlue: c("44;97"),
  bgGray: c("100;97"),
};

/** Visible length of a string once ANSI codes are stripped. */
const vlen = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").length;

/** Pad to a visible width (ANSI-aware). */
const pad = (s, w) => s + " ".repeat(Math.max(0, w - vlen(s)));

/** Truncate to a visible width with an ellipsis (ANSI-aware). */
const fit = (s, w) => {
  if (vlen(s) <= w) return s;
  let out = "";
  let vis = 0;
  for (let i = 0; i < s.length; ) {
    const m = /^\x1b\[[0-9;]*m/.exec(s.slice(i));
    if (m) {
      out += m[0];
      i += m[0].length;
      continue;
    }
    if (vis >= w - 1) break;
    out += s[i];
    vis++;
    i++;
  }
  return out + "…" + (TTY ? "\x1b[0m" : "");
};

const WIDTH = 62;

export const BADGE = {
  PASS: paint.bgGreen(" PASS "),
  FAIL: paint.bgRed(" FAIL "),
  WARN: paint.bgYellow(" WARN "),
  SKIP: paint.bgGray(" SKIP "),
  RUN: paint.bgBlue(" RUN  "),
};

/** Boxed card. rows = array of strings (may contain ANSI). */
export function card(title, rows, tint = paint.cyan) {
  const top = title
    ? `╭─ ${paint.bold(title)} ${"─".repeat(Math.max(1, WIDTH - vlen(title) - 5))}╮`
    : `╭${"─".repeat(WIDTH - 2)}╮`;
  console.log(tint(top));
  for (const r of rows) {
    console.log(tint("│") + "  " + pad(fit(r, WIDTH - 5), WIDTH - 5) + " " + tint("│"));
  }
  console.log(tint(`╰${"─".repeat(WIDTH - 2)}╯`));
}

export function banner({ title, subtitle, meta }) {
  console.log("");
  card(null, [
    `${paint.bold(paint.cyan("⚡ " + title))}`,
    paint.bold(subtitle),
    paint.gray(meta),
  ]);
}

const fmtMs = (ms) => (ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(1)}ms`);

export function createRunner({ title, subtitle, file }) {
  const t0 = performance.now();
  const stats = { passed: 0, failed: 0, skipped: 0, suites: 0, failures: [] };
  let step = 0;
  let suiteCount = 0;
  let suiteStart = 0;

  const flushSuite = () => {
    if (!stats.suites) return;
    const took = fmtMs(performance.now() - suiteStart);
    console.log(
      paint.gray(`  ╰ ${suiteCount} check${suiteCount === 1 ? "" : "s"} complete  ·  ${took}`)
    );
  };

  banner({
    title,
    subtitle,
    meta: `${file}  ·  node ${process.version}  ·  ${new Date().toLocaleString()}`,
  });

  return {
    suite(name) {
      flushSuite();
      stats.suites++;
      suiteCount = 0;
      suiteStart = performance.now();
      console.log("");
      console.log(`  ${paint.cyan("◆")} ${paint.bold(name)}`);
      console.log(paint.gray(`  ${"┈".repeat(WIDTH - 4)}`));
    },

    test(name, fn) {
      step++;
      suiteCount++;
      const n = paint.gray(String(step).padStart(2, "0"));
      const s = performance.now();
      try {
        fn();
        const took = paint.gray(fmtMs(performance.now() - s));
        console.log(`  ${n}  ${BADGE.PASS}  ${pad(fit(name, WIDTH - 22), WIDTH - 22)} ${took}`);
        stats.passed++;
      } catch (err) {
        console.log(`  ${n}  ${BADGE.FAIL}  ${paint.red(fit(name, WIDTH - 14))}`);
        const msg = fit(String(err?.message ?? err).split("\n")[0], WIDTH - 12);
        console.log(`          ${paint.red("↳")} ${paint.dim(msg)}`);
        stats.failed++;
        stats.failures.push({ step, name, msg });
      }
    },

    skip(name, reason = "") {
      step++;
      suiteCount++;
      const n = paint.gray(String(step).padStart(2, "0"));
      console.log(
        `  ${n}  ${BADGE.SKIP}  ${paint.gray(fit(name, WIDTH - 22))}${reason ? paint.gray("  ·  " + reason) : ""}`
      );
      stats.skipped++;
    },

    finish() {
      flushSuite();
      const total = stats.passed + stats.failed + stats.skipped;
      const took = fmtMs(performance.now() - t0);
      const ok = stats.failed === 0;
      const rate = total ? Math.round((stats.passed / total) * 100) : 0;
      const filled = Math.round((rate / 100) * 24);
      const bar =
        (ok ? paint.green : paint.yellow)("█".repeat(filled)) +
        paint.gray("░".repeat(24 - filled));

      console.log("");
      card(
        "Execution Summary",
        [
          `${paint.gray("Status")}      ${
            ok
              ? BADGE.PASS + "  " + paint.green(paint.bold("All checks passed"))
              : BADGE.FAIL + "  " + paint.red(paint.bold(`${stats.failed} check${stats.failed === 1 ? "" : "s"} failed`))
          }`,
          `${paint.gray("Suites")}      ${paint.bold(String(stats.suites))}`,
          `${paint.gray("Checks")}      ${paint.green(stats.passed + " passed")}` +
            (stats.failed ? `  ${paint.red(stats.failed + " failed")}` : "") +
            (stats.skipped ? `  ${paint.gray(stats.skipped + " skipped")}` : ""),
          `${paint.gray("Duration")}    ${paint.bold(took)}`,
          `${paint.gray("Pass rate")}   ${bar} ${paint.bold(rate + "%")}`,
        ],
        ok ? paint.green : paint.red
      );

      if (stats.failures.length) {
        console.log("");
        card(
          "Failed Checks",
          stats.failures.map(
            (f) => `${paint.red("✘")} ${paint.gray("#" + String(f.step).padStart(2, "0"))} ${f.name}`
          ),
          paint.red
        );
      }
      console.log("");
      process.exitCode = ok ? 0 : 1;
      return ok;
    },
  };
}
