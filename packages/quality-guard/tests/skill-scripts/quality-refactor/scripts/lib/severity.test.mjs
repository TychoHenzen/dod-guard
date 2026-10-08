import assert from "node:assert/strict";
import { test } from "node:test";
import { requireSeverity } from "../../../../../skills/quality-refactor/scripts/lib/severity.mjs";

const UNKNOWN_ERROR = /unknown quality severity: error/;
const UNKNOWN_WARN = /unknown quality severity: warn/;
const UNKNOWN_UNDEFINED = /unknown quality severity: undefined/;

test("requireSeverity keeps the high, medium, and low vocabulary", () => {
  assert.equal(requireSeverity("high"), "high");
  assert.equal(requireSeverity("medium"), "medium");
  assert.equal(requireSeverity("low"), "low");
});

test("requireSeverity rejects every other severity", () => {
  assert.throws(() => requireSeverity("error"), UNKNOWN_ERROR);
  assert.throws(() => requireSeverity("warn"), UNKNOWN_WARN);
  assert.throws(() => requireSeverity(undefined), UNKNOWN_UNDEFINED);
});
