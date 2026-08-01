import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderSimilarity, scoreOverlap } from "./overlap-metrics.mjs";

describe("orderSimilarity", () => {
  it("scores a preserved subsequence as one", () => {
    assert.equal(orderSimilarity(["a", "b", "c"], ["a", "c"]), 1);
  });

  it("scores a reordered pair as one half", () => {
    assert.equal(orderSimilarity(["a", "b", "c"], ["c", "a"]), 0.5);
  });

  it("scores an empty rewrite as zero", () => {
    assert.equal(orderSimilarity(["a"], []), 0);
  });
});

describe("scoreOverlap contracts", () => {
  // 65 unique tokens, one per word, so the shared run exceeds the run limit
  // (60) whenever the contract text is left in and counted.
  const CONTRACT = Array.from({ length: 65 }, (_, i) => `word${i}`).join(" ");

  it("stops a shared contract string from contributing to run", () => {
    const original = `${CONTRACT}\nzzz1 zzz2 zzz3 zzz4`;
    const rewrite = `${CONTRACT}\nyyy1 yyy2 yyy3 yyy4`;

    const withoutContract = scoreOverlap(original, rewrite);
    assert.equal(withoutContract.metrics.run, 65);
    assert.ok(withoutContract.breached.includes("run"));

    const options = { contracts: [CONTRACT] };
    const withContract = scoreOverlap(original, rewrite, options);
    assert.equal(withContract.metrics.run, 0);
    assert.ok(!withContract.breached.includes("run"));
  });

  it("still reports cosmetic when the rest is a straight copy", () => {
    const body = [
      "export function summarize(orders, rates) {",
      "  const totals = new Map();",
      "  for (const order of orders) {",
      "    const rate = rates[order.currency] ?? 1;",
      "    totals.set(order.region, (totals.get(order.region) ?? 0) + rate);",
      "  }",
      "  return totals;",
      "}",
    ].join("\n");
    const original = `${CONTRACT}\n${body}`;
    const rewrite = `${CONTRACT}\n${body}`;

    const result = scoreOverlap(original, rewrite, { contracts: [CONTRACT] });
    assert.equal(result.verdict, "cosmetic");
  });

  // Two spellings of the same required guard block: one line has a trailing
  // comment and a blank line, the other does not. Both tokenize to the same
  // sequence, so a byte-for-byte contract match would miss one side. `===`
  // is 3 tokens (the tokenizer splits every punctuation char on its own):
  // 14 + 12 + 0 + 8 + 0 + 4 = 38.
  const GUARD_WITH_COMMENT = [
    "if (process.argv[1] === _filename) {",
    "  const argv = process.argv.slice(2);",
    "",
    "  if (isCliInvocation(argv)) {",
    "    // run once, exit with a verdict code.",
    "    runCli(argv)",
  ].join("\n");
  const GUARD_WITHOUT_COMMENT = [
    "if (process.argv[1] === _filename) {",
    "  const argv = process.argv.slice(2);",
    "  if (isCliInvocation(argv)) {",
    "    runCli(argv)",
  ].join("\n");
  const GUARD_TOKEN_COUNT = 38;

  it("removes a contract block whose two sides differ only in whitespace", () => {
    // Bare, punctuation-free tails. A call-shaped tail like "foo()" would
    // still share its parens and terminator with the other side.
    const original = `${GUARD_WITH_COMMENT}\nzzzOriginal`;
    const rewrite = `${GUARD_WITHOUT_COMMENT}\nyyyRewrite`;

    const bare = scoreOverlap(original, rewrite);
    assert.equal(bare.metrics.run, GUARD_TOKEN_COUNT);
    const belowLimit = bare.breached.includes("run") === false;
    assert.ok(belowLimit, "38 is under the 60 limit");

    const opts = { contracts: [GUARD_WITH_COMMENT] };
    const result = scoreOverlap(original, rewrite, opts);
    assert.equal(result.metrics.run, 0);
  });

  it("stops a contract occurrence from contributing to the line metric too", () => {
    const original = `${GUARD_WITH_COMMENT}\nreturn distinctOriginal();`;
    const rewrite = `${GUARD_WITHOUT_COMMENT}\nreturn distinctRewrite();`;

    // Without the contract, the four guard lines line up on both sides.
    // significantLines already hides the comment and the blank line, so
    // only the two "return distinct*" lines are left unmatched.
    const bare = scoreOverlap(original, rewrite);
    assert.equal(bare.samples.lines, 4);

    // With the contract, all four guard lines are recognised as contract
    // text on both sides and dropped, so nothing is left to match.
    const opts = { contracts: [GUARD_WITH_COMMENT] };
    const result = scoreOverlap(original, rewrite, opts);
    assert.equal(result.samples.lines, 0);
  });

  it("still calls it cosmetic when only a differently-spelled contract is exempt", () => {
    const body = [
      "export function summarize(orders, rates) {",
      "  const totals = new Map();",
      "  for (const order of orders) {",
      "    const rate = rates[order.currency] ?? 1;",
      "    totals.set(order.region, (totals.get(order.region) ?? 0) + rate);",
      "  }",
      "  return totals;",
      "}",
    ].join("\n");
    const original = `${GUARD_WITH_COMMENT}\n${body}`;
    const rewrite = `${GUARD_WITHOUT_COMMENT}\n${body}`;

    const result = scoreOverlap(original, rewrite, { contracts: [GUARD_WITH_COMMENT] });
    assert.equal(result.verdict, "cosmetic");
  });
});
