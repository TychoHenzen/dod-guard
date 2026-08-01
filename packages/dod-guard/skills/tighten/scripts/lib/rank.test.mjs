import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSignal, rankCandidates, tangleScore } from "./rank.mjs";

const candidate = (file, rules, extra = {}) => ({
  file,
  rules,
  hasOracle: false,
  ...extra,
  churn: { returns: 0, fixReturns: 0, ...extra.churn },
});

const order = (...candidates) =>
  rankCandidates(candidates).map((entry) => entry.file);

describe("tangleScore", () => {
  it("scores formatting noise and unknown rules as zero", () => {
    assert.equal(tangleScore({ "line-length": 400 }), 0);
    assert.equal(tangleScore({ "rule-from-the-future": 9 }), 0);
    assert.equal(tangleScore({}), 0);
  });

  it("weighs a tangle rule above a shape rule", () => {
    const tangle = tangleScore({ complexity: 1 });
    assert.ok(tangle > tangleScore({ "file-length": 1 }));
  });

  it("sums the weighted count of every rule it knows", () => {
    const both = tangleScore({ complexity: 2, "file-length": 1 });
    const parts =
      tangleScore({ complexity: 2 }) + tangleScore({ "file-length": 1 });
    assert.equal(both, parts);
  });

});

describe("isSignal", () => {
  it("holds only for the rules that score", () => {
    assert.equal(isSignal("complexity"), true);
    assert.equal(isSignal("line-length"), false);
    assert.equal(isSignal("rule-from-the-future"), false);
  });
});

describe("rankCandidates", () => {
  it("orders by tangle when churn is equal", () => {
    const light = candidate("a.ts", { complexity: 1 });
    const heavy = candidate("b.ts", { complexity: 9 });
    assert.deepEqual(order(light, heavy), ["b.ts", "a.ts"]);
  });

  it("ranks a churned file above an identical quiet one", () => {
    const quiet = candidate("a.ts", { complexity: 4 });
    const churn = { returns: 20 };
    const busy = candidate("b.ts", { complexity: 4 }, { churn });
    assert.deepEqual(order(quiet, busy), ["b.ts", "a.ts"]);
  });

  it("weighs a return that fixed something above an ordinary return", () => {
    const plain = { churn: { returns: 4 } };
    const features = candidate("a.ts", { complexity: 4 }, plain);
    const churn = { returns: 4, fixReturns: 4 };
    const patched = candidate("b.ts", { complexity: 4 }, { churn });
    assert.deepEqual(order(features, patched), ["b.ts", "a.ts"]);
  });

  // Otherwise one file with hundreds of returns owns every slot in the queue.
  it("lets a much worse tangle outrank a much busier file", () => {
    const loud = { churn: { returns: 200 } };
    const busy = candidate("a.ts", { complexity: 1 }, loud);
    const knotted = candidate("b.ts", { complexity: 40 });
    assert.deepEqual(order(busy, knotted), ["b.ts", "a.ts"]);
  });

  it("prefers a target that already has an oracle", () => {
    const blind = candidate("a.ts", { complexity: 4 });
    const tested = candidate("b.ts", { complexity: 4 }, { hasOracle: true });
    assert.deepEqual(order(blind, tested), ["b.ts", "a.ts"]);
  });

  it("attaches the score it ranked on", () => {
    const [top] = rankCandidates([candidate("a.ts", { complexity: 3 })]);
    assert.ok(top.score > 0);
  });

  it("drops a candidate whose violations are all formatting", () => {
    const churn = { returns: 50 };
    const flat = candidate("a.ts", { "line-length": 90 }, { churn });
    assert.deepEqual(rankCandidates([flat]), []);
    assert.deepEqual(rankCandidates([]), []);
  });

  it("breaks a tie by path so the order is stable", () => {
    const left = candidate("b.ts", { complexity: 2 });
    const right = candidate("a.ts", { complexity: 2 });
    assert.deepEqual(order(left, right), ["a.ts", "b.ts"]);
  });
});
