import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchRate } from "./match-rate.mjs";

describe("matchRate", () => {
  it("scores an identical list as one", () => {
    assert.equal(matchRate(["a", "b"], ["a", "b"]), 1);
  });

  it("scores one hit out of two candidates as one half", () => {
    assert.equal(matchRate(["a", "b"], ["a", "z"]), 0.5);
  });

  it("scores an empty candidate list as zero", () => {
    assert.equal(matchRate(["a"], []), 0);
  });

  it("matches a duplicate candidate only as often as the source holds it", () => {
    assert.equal(matchRate(["a"], ["a", "a"]), 0.5);
  });
});
