import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchCounts } from "./match-rate.mjs";

describe("matchCounts", () => {
  it("counts every candidate as matched for an identical list", () => {
    const actual = matchCounts(["a", "b"], ["a", "b"]);
    assert.deepEqual(actual, { matched: 2, total: 2 });
  });

  it("counts one hit out of two candidates", () => {
    const actual = matchCounts(["a", "b"], ["a", "z"]);
    assert.deepEqual(actual, { matched: 1, total: 2 });
  });

  it("reports a zero total for an empty candidate list", () => {
    assert.deepEqual(matchCounts(["a"], []), { matched: 0, total: 0 });
  });

  it("matches a duplicate only as often as the source holds it", () => {
    assert.deepEqual(matchCounts(["a"], ["a", "a"]), { matched: 1, total: 2 });
  });
});
