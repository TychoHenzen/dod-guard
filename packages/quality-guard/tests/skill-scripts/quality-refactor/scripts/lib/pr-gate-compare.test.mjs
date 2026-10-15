import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyChanges,
  compareFindings,
  evaluateGate,
  evaluateQuota,
  findingKey,
} from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-compare.mjs";

const finding = (file, rule, message, severity = "medium", line = 1, metric = 1) => ({
  file,
  line,
  rule,
  severity,
  message,
  metric,
});

const modified = (path) => ({ path, basePath: path });
const options = { blockOn: "medium", fixMediumHigh: 1, fixLow: 3 };

test("findingKey ignores measured numbers but keeps the rule and subject", () => {
  const a = findingKey(finding("a.cs", "complexity", "Load() cyclomatic complexity 11"));
  const b = findingKey(finding("a.cs", "complexity", "Load() cyclomatic complexity 14"));
  const c = findingKey(finding("a.cs", "complexity", "Save() cyclomatic complexity 11"));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("a finding present at the merge base is not new, even when its line moved", () => {
  const base = [finding("a.cs", "complexity", "Load() cyclomatic complexity 11", "medium", 10)];
  const head = [finding("a.cs", "complexity", "Load() cyclomatic complexity 11", "medium", 42)];
  const result = compareFindings(head, base);
  assert.equal(result.fresh.length, 0);
  assert.equal(result.existing.length, 1);
  assert.equal(result.resolved.length, 0);
});

test("a finding that only exists at HEAD is new, and one that only existed at base is resolved", () => {
  const base = [finding("a.cs", "flag-parameter", "Old() takes a boolean flag")];
  const head = [finding("a.cs", "flag-parameter", "Fresh() takes a boolean flag")];
  const result = compareFindings(head, base);
  assert.deepEqual(result.fresh.map((f) => f.message), ["Fresh() takes a boolean flag"]);
  assert.deepEqual(result.resolved.map((f) => f.message), ["Old() takes a boolean flag"]);
});

test("repeated findings are matched by count: one extra long line is new", () => {
  const long = (line) => finding("a.cs", "line-length", "line is 130 chars", "medium", line, 130);
  const result = compareFindings([long(3), long(9), long(20)], [long(3), long(9)]);
  assert.equal(result.existing.length, 2);
  assert.equal(result.fresh.length, 1);
});

test("a finding that grew is still pre-existing but is reported as worsened", () => {
  const base = [finding("a.cs", "file-length", "file is 325 lines", "medium", 1, 325)];
  const head = [finding("a.cs", "file-length", "file is 340 lines", "high", 1, 340)];
  const result = compareFindings(head, base);
  assert.equal(result.fresh.length, 0);
  assert.equal(result.worsened.length, 1);
  assert.equal(result.worsened[0].was.message, "file is 325 lines");
});

test("an added file has no base, so every finding in it is new", () => {
  const head = [finding("b.cs", "line-length", "line is 130 chars")];
  const classified = classifyChanges([{ path: "b.cs", basePath: null }], head, []);
  assert.equal(classified.fresh.length, 1);
});

test("a renamed file keeps its pre-existing findings through the old path", () => {
  const base = [finding("old/Name.cs", "line-length", "line is 130 chars")];
  const head = [finding("new/Name.cs", "line-length", "line is 130 chars")];
  const classified = classifyChanges([{ path: "new/Name.cs", basePath: "old/Name.cs" }], head, base);
  assert.equal(classified.fresh.length, 0);
  assert.equal(classified.existing.length, 1);
});

test("code moved from one changed file to another is not new", () => {
  const base = [finding("big.cs", "stateless-method", "Helper() never touches instance state")];
  const head = [finding("small.cs", "stateless-method", "Helper() never touches instance state")];
  const classified = classifyChanges([modified("big.cs"), modified("small.cs")], head, base);
  assert.equal(classified.fresh.length, 0);
  assert.equal(classified.moved.length, 1);
  assert.equal(classified.resolved.length, 0);
});

test("findings in files the pull request did not change, and generated output, are ignored", () => {
  const head = [
    finding("untouched.cs", "line-length", "line is 130 chars", "high"),
    finding("dist/out.js", "line-length", "line is 130 chars", "high"),
  ];
  const classified = classifyChanges([modified("dist/out.js")], head, []);
  assert.equal(classified.fresh.length, 0);
});

test("only new findings at or above the threshold block", () => {
  const head = [
    finding("a.cs", "line-length", "line is 130 chars", "high"),
    finding("a.cs", "param-count", "Add() takes 5 parameters", "medium"),
    finding("a.cs", "comment-bloat", "9-line comment", "low"),
  ];
  const classified = classifyChanges([{ path: "a.cs", basePath: null }], head, []);
  assert.equal(evaluateGate(classified, { ...options, blockOn: "medium" }).blocking.length, 2);
  assert.equal(evaluateGate(classified, { ...options, blockOn: "high" }).blocking.length, 1);
});

test("a per-rule threshold replaces the default for that rule only", () => {
  const head = [
    finding("a.cs", "line-length", "line is 100 chars", "medium"),
    finding("a.cs", "line-length", "line is 130 chars", "high"),
    finding("a.cs", "param-count", "Add() takes 5 parameters", "medium"),
  ];
  const classified = classifyChanges([{ path: "a.cs", basePath: null }], head, []);
  const gate = evaluateGate(classified, { ...options, ruleBlockOn: { "line-length": "high" } });
  assert.deepEqual(gate.blocking.map((f) => f.message), ["line is 130 chars", "Add() takes 5 parameters"]);
});

test("the quota is met by removing one medium/high or three low pre-existing findings", () => {
  const base = [
    finding("a.cs", "line-length", "line is 130 chars"),
    finding("a.cs", "param-count", "Add() takes 5 parameters"),
  ];
  const untouched = classifyChanges([modified("a.cs")], base, base);
  assert.equal(evaluateQuota(untouched, options).satisfied, false);
  const oneFixed = classifyChanges([modified("a.cs")], base.slice(1), base);
  assert.equal(evaluateQuota(oneFixed, options).satisfied, true);
});

test("three low findings removed also satisfy the quota", () => {
  const lows = ["a", "b", "c", "d"].map((name) => finding("a.cs", "comment-bloat", `${name}() note`, "low"));
  const fixedThree = classifyChanges([modified("a.cs")], lows.slice(3), lows);
  assert.equal(evaluateQuota(fixedThree, options).satisfied, true);
  const fixedTwo = classifyChanges([modified("a.cs")], lows.slice(2), lows);
  assert.equal(evaluateQuota(fixedTwo, options).satisfied, false);
});

test("the quota is capped at what exists and switches off when both targets are zero", () => {
  const clean = classifyChanges([modified("a.cs")], [], []);
  assert.equal(evaluateQuota(clean, options).satisfied, true);
  const base = [finding("a.cs", "line-length", "line is 130 chars")];
  const stale = classifyChanges([modified("a.cs")], base, base);
  assert.equal(evaluateQuota(stale, { ...options, fixMediumHigh: 0, fixLow: 0 }).satisfied, true);
});

test("the gate fails on a new finding even when the quota is met, and on an unmet quota with no new findings", () => {
  const base = [finding("a.cs", "line-length", "line is 130 chars")];
  const newAndFixed = classifyChanges([modified("a.cs")], [finding("a.cs", "param-count", "Add() takes 5 parameters")], base);
  assert.equal(evaluateGate(newAndFixed, options).passed, false);
  const idle = classifyChanges([modified("a.cs")], base, base);
  assert.equal(evaluateGate(idle, options).passed, false);
  const paidDown = classifyChanges([modified("a.cs")], [], base);
  assert.equal(evaluateGate(paidDown, options).passed, true);
});
