import assert from "node:assert/strict";
import { test } from "node:test";
import { requireSeverity } from "../../../../../skills/quality-refactor/scripts/lib/severity.mjs";

test("requireSeverity keeps the high, medium, and low vocabulary", () => {
  assert.equal(requireSeverity("high"), "high");
  assert.equal(requireSeverity("medium"), "medium");
  assert.equal(requireSeverity("low"), "low");
});

test("requireSeverity rejects every other severity", () => {
  assert.throws(() => requireSeverity("error"), /unknown quality severity: error/);
  assert.throws(() => requireSeverity("warn"), /unknown quality severity: warn/);
  assert.throws(() => requireSeverity(undefined), /unknown quality severity: undefined/);
});
