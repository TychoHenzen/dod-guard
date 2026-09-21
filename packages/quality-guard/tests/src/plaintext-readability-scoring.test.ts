import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkPlaintextReadability,
  unavailableReadabilityResult,
} from "../../src/plaintext-readability.js";
import { READABILITY_POLICY } from "../../src/plaintext-readability-types.js";
import { easyText } from "./plaintext-readability-test-support.js";

test("passes easy text with the documented measure policy", () => {
  const result = checkPlaintextReadability(easyText, () => ({
    status: "ok",
    measures: { fleschReadingEase: 72, fleschKincaidGrade: 8 },
  }));
  assert.equal(result.status, "pass");
  assert.equal(result.score, 100);
  assert.equal(result.threshold, READABILITY_POLICY.threshold);
  assert.deepEqual(result.constraintFailures, []);
});

test("reports measured values, threshold, and context for failing text", () => {
  const result = checkPlaintextReadability(easyText, () => ({
    status: "ok",
    measures: { fleschReadingEase: 20, fleschKincaidGrade: 14 },
  }));
  assert.equal(result.status, "fail");
  assert.equal(result.measures?.fleschReadingEase, 20);
  assert.equal(result.measures?.fleschKincaidGrade, 14);
  assert.equal(result.score, 20);
  assert.match(result.message, /combined score 20; threshold 80/);
  assert.match(result.message, /Context:/);
});

test("unavailable results report unavailable rather than skipped", () => {
  const result = unavailableReadabilityResult("stdin broke");
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /Readability check unavailable: stdin broke/);
  assert.doesNotMatch(result.message, /skipped/);
});
