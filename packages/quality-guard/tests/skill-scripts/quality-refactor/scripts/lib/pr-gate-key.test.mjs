import assert from "node:assert/strict";
import { test } from "node:test";
import { findingKey } from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-key.mjs";
import { classify, finding, modified } from "./pr-gate-test-support.mjs";

const long = (symbol, line, extra = {}) => finding({ symbol, line, ...extra });

test("the key joins rule, symbol and the digit-masked message", () => {
  assert.equal(
    findingKey(
      finding({ symbol: "alpha", message: "line is 130 chars (width 80)" }),
    ),
    "line-length|alpha|line is # chars (width #)",
  );
  assert.equal(
    findingKey(finding({ message: "line is 130 chars (width 80)" })),
    "line-length||line is # chars (width #)",
  );
});

test("the same message in a different function is a new finding", () => {
  // A renamed function reads the same way, which is the accepted cost.
  const result = classify([long("beta", 30)], [long("alpha", 10)]);
  assert.equal(result.fresh.length, 1);
  assert.equal(result.fresh[0].symbol, "beta");
  assert.equal(result.resolved.length, 1);
  assert.equal(result.resolved[0].symbol, "alpha");
  assert.equal(result.existing.length, 0);
});

test("a finding that only changes line stays unchanged", () => {
  const result = classify([long("alpha", 40)], [long("alpha", 10)]);
  assert.equal(result.existing.length, 1);
  assert.equal(result.fresh.length, 0);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.worsened.length, 0);
});

test("findings without a symbol pair by rule and message", () => {
  const result = classify([finding({ line: 5 })], [finding({ line: 50 })]);
  assert.equal(result.existing.length, 1);
  assert.equal(result.fresh.length, 0);
});

test("two functions sharing a name pair by count", () => {
  const result = classify([long("run", 5), long("run", 50)], [long("run", 5)]);
  assert.equal(result.existing.length, 1);
  assert.equal(result.fresh.length, 1);
});

test("empty scans compare without error", () => {
  const result = classify([], []);
  assert.deepEqual(result.fresh, []);
  assert.deepEqual(result.existing, []);
  assert.deepEqual(result.resolved, []);
  assert.deepEqual(result.worsened, []);
  assert.deepEqual(result.moved, []);
});

test("a function moved to another changed file stays moved", () => {
  const result = classify(
    [finding({ file: "b.cs", symbol: "alpha", line: 3 })],
    [finding({ file: "a.cs", symbol: "alpha", line: 9 })],
    [modified("a.cs"), modified("b.cs")],
  );
  assert.equal(result.fresh.length, 0);
  assert.equal(result.moved.length, 1);
});

test("a renamed function's finding is fresh, not moved", () => {
  const result = classify(
    [finding({ symbol: "beta", line: 3 })],
    [finding({ symbol: "alpha", line: 9 })],
    [modified("a.cs")],
  );
  assert.equal(result.moved.length, 0);
  assert.equal(result.fresh.length, 1);
});
