import assert from "node:assert/strict";
import test from "node:test";

import { evaluateGate } from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-evaluate.mjs";
import { classify, finding } from "./pr-gate-test-support.mjs";

const options = { blockOn: "medium", fixMediumHigh: 1, fixLow: 3 };
const longLine = finding();
const params = finding({
  rule: "param-count",
  message: "Add() takes 5 parameters",
});
const note = (name) =>
  finding({
    rule: "comment-bloat",
    message: `${name}() note`,
    severity: "low",
  });

test("only new findings at or above the threshold block", () => {
  const head = [finding({ severity: "high" }), params, note("a")];
  const classified = classify(head, [], [{ path: "a.cs", basePath: null }]);
  assert.equal(
    evaluateGate(classified, { ...options, blockOn: "medium" }).blocking.length,
    2,
  );
  assert.equal(
    evaluateGate(classified, { ...options, blockOn: "high" }).blocking.length,
    1,
  );
});

test("a per-rule threshold replaces the default for that rule only", () => {
  const head = [
    finding({ message: "line is 100 chars" }),
    finding({ severity: "high" }),
    params,
  ];
  const classified = classify(head, [], [{ path: "a.cs", basePath: null }]);
  const gate = evaluateGate(classified, {
    ...options,
    ruleBlockOn: { "line-length": "high" },
  });
  assert.deepEqual(
    gate.blocking.map((f) => f.message),
    ["line is 130 chars", "Add() takes 5 parameters"],
  );
});

test("at block-on high, medium findings still count: removing one pays the quota, adding one does not block", () => {
  const atHigh = { ...options, blockOn: "high" };
  const paidDown = evaluateGate(classify([], [longLine]), atHigh);
  assert.equal(paidDown.quota.fixed.top, 1);
  assert.equal(paidDown.passed, true);
  assert.deepEqual(
    evaluateGate(classify([longLine, params], [longLine]), atHigh).blocking,
    [],
  );
});

test("the quota is met by removing one medium/high pre-existing finding", () => {
  const base = [longLine, params];
  assert.equal(
    evaluateGate(classify(base, base), options).quota.satisfied,
    false,
  );
  assert.equal(
    evaluateGate(classify(base.slice(1), base), options).quota.satisfied,
    true,
  );
});

test("three low findings removed also satisfy the quota, two do not", () => {
  const lows = ["a", "b", "c", "d"].map(note);
  assert.equal(
    evaluateGate(classify(lows.slice(3), lows), options).quota.satisfied,
    true,
  );
  assert.equal(
    evaluateGate(classify(lows.slice(2), lows), options).quota.satisfied,
    false,
  );
});

test("the quota is capped at what exists and switches off when both targets are zero", () => {
  assert.equal(evaluateGate(classify([], []), options).quota.satisfied, true);
  const stale = classify([longLine], [longLine]);
  assert.equal(
    evaluateGate(stale, { ...options, fixMediumHigh: 0, fixLow: 0 }).quota
      .satisfied,
    true,
  );
});

test("a new finding fails the gate even when the quota is met", () => {
  const classified = classify([params], [longLine]);
  const gate = evaluateGate(classified, options);
  assert.equal(gate.quota.satisfied, true);
  assert.equal(gate.passed, false);
});

test("an unmet quota fails the gate with no new findings, and paying down passes it", () => {
  assert.equal(
    evaluateGate(classify([longLine], [longLine]), options).passed,
    false,
  );
  assert.equal(evaluateGate(classify([], [longLine]), options).passed, true);
});
