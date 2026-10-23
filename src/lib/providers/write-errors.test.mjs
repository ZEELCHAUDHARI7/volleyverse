/**
 * What the sync alert says when the database refuses a write.
 * Run: node --experimental-strip-types src/lib/providers/write-errors.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "../console-ui.mjs";
import { describeRejection } from "./write-errors.ts";

const qa = createRunner({
  title: "VOLLEYTICS QA AGENT",
  subtitle: "Write Rejection Suite",
  file: "src/lib/providers/write-errors.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const fk = { code: "23503", message: "insert or update on table violates foreign key constraint" };

t("an update reads 'an update', not 'a update'", () => {
  // The report: "rejected a update".
  assert.match(describeRejection({ kind: "update", table: "matches" }, fk), /^The database rejected an update to matches:/);
});

t("a write and a delete keep their article", () => {
  assert.match(describeRejection({ kind: "upsert", table: "players" }, fk), /^The database rejected a write to players:/);
  assert.match(describeRejection({ kind: "delete", table: "players" }, fk), /^The database rejected a delete from players:/);
});

t("the database's own reason is kept", () => {
  assert.match(describeRejection({ kind: "update", table: "matches" }, fk), /violates foreign key constraint/);
});

qa.finish();
