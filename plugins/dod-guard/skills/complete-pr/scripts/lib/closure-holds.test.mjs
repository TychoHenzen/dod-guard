import assert from "node:assert/strict";
import test from "node:test";
import { holdSummary } from "./closure-holds.mjs";

test("holdSummary counts holds and lists issues once in first-seen order", () => {
  const holds = [
    { issue: 778, reasons: ["a"] },
    { issue: null, reasons: ["b"] },
    { issue: 777, reasons: ["c"] },
    { issue: 778, reasons: ["d"] },
  ];
  assert.deepEqual(holdSummary(holds), { count: 4, issues: [778, 777] });
});

test("holdSummary of no holds", () => {
  assert.deepEqual(holdSummary([]), { count: 0, issues: [] });
});
