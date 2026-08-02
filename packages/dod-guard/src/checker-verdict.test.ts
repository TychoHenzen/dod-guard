// The verdict priority order is the security contract of this package. cli.ts
// turns the verdict into an exit code. evomcp branches on that exit code, so a
// level that stops beating the ones below it reaches another package.
//
// Each case sets a higher level together with every level below it. That way a
// rearranged order fails the test, not only a broken level.

import assert from "node:assert/strict";
import { test } from "node:test";
import { computeOverall, type VerdictInput } from "./checker-verdict.js";

function input(overrides: Partial<VerdictInput> = {}): VerdictInput {
  return {
    tampered: false,
    scoped: false,
    draftCount: 0,
    stuck: false,
    anyFail: false,
    dirty: false,
    allowDirtyPass: false,
    ...overrides,
  };
}

test("a clean run with nothing set passes", () => {
  assert.equal(computeOverall(input()), "pass");
});

test("tampering beats every other level", () => {
  const everything = input({
    tampered: true,
    scoped: true,
    draftCount: 3,
    stuck: true,
    anyFail: true,
    dirty: true,
  });
  assert.equal(computeOverall(everything), "fail");
});

test("a scoped run beats drafts, stuck and failure", () => {
  const scoped = input({ scoped: true, draftCount: 2, stuck: true, anyFail: true });
  assert.equal(computeOverall(scoped), "incomplete");
});

test("a scoped run never passes, even with nothing else set", () => {
  assert.equal(computeOverall(input({ scoped: true })), "incomplete");
});

test("a remaining draft beats stuck and failure", () => {
  assert.equal(computeOverall(input({ draftCount: 1, stuck: true, anyFail: true })), "incomplete");
});

test("stuck beats an ordinary failure", () => {
  assert.equal(computeOverall(input({ stuck: true, anyFail: true })), "stuck");
});

test("stuck beats an otherwise passing run", () => {
  assert.equal(computeOverall(input({ stuck: true })), "stuck");
});

test("a failure beats the dirty downgrade", () => {
  assert.equal(computeOverall(input({ anyFail: true, dirty: true })), "fail");
});

test("a passing run on a dirty tree downgrades", () => {
  assert.equal(computeOverall(input({ dirty: true })), "pass_dirty");
});

test("a document that allows a dirty pass keeps passing", () => {
  assert.equal(computeOverall(input({ dirty: true, allowDirtyPass: true })), "pass");
});

test("allowing a dirty pass does not rescue a failing run", () => {
  assert.equal(computeOverall(input({ anyFail: true, dirty: true, allowDirtyPass: true })), "fail");
});
