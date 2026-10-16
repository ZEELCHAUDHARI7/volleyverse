/**
 * Number fields in League Setup. Run: node --experimental-strip-types src/lib/number-fields.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { checkCapacity, checkHeightCm, checkShirtNumber } from "./number-fields.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Number Fields Suite",
  file: "src/lib/number-fields.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const refused = (check, raw) => {
  const r = check(raw);
  assert.equal(r.ok, false, `${JSON.stringify(raw)} should be refused`);
  assert.ok(r.error.length > 0);
};

t("a blank box means not listed", () => {
  for (const check of [checkShirtNumber, checkHeightCm, checkCapacity]) {
    assert.deepEqual(check(""), { ok: true, value: null });
    assert.deepEqual(check("  "), { ok: true, value: null });
  }
});

t("whole numbers in range are kept", () => {
  assert.deepEqual(checkShirtNumber("1"), { ok: true, value: 1 });
  assert.deepEqual(checkShirtNumber(" 99 "), { ok: true, value: 99 });
  assert.deepEqual(checkHeightCm("180"), { ok: true, value: 180 });
  assert.deepEqual(checkCapacity("12500"), { ok: true, value: 12500 });
});

t("decimals the database cannot store are refused", () => {
  refused(checkCapacity, "12.5");
  refused(checkShirtNumber, "2.5");
  refused(checkHeightCm, "180.5");
});

t("shirt numbers outside 1-99 are refused", () => {
  refused(checkShirtNumber, "-3");
  refused(checkShirtNumber, "0");
  refused(checkShirtNumber, "100");
  refused(checkShirtNumber, "1000");
});

t("heights and capacities outside a real range are refused", () => {
  refused(checkHeightCm, "18");
  refused(checkHeightCm, "1800");
  refused(checkCapacity, "0");
  refused(checkCapacity, "-50");
  refused(checkCapacity, "3000000000");
});

t("text that is not a plain number is refused", () => {
  for (const raw of ["abc", "1e3", "+5", "12 000", "0x10", "Infinity"]) {
    refused(checkCapacity, raw);
    refused(checkShirtNumber, raw);
  }
});

qa.finish();
