import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { scoreProseOverlap } from "./prose-metrics.mjs";

const FIXTURES_DIR = fileURLToPath(new URL("../fixtures/prose/", import.meta.url));

function readFixture(name) {
  return readFileSync(`${FIXTURES_DIR}${name}`, "utf8");
}

describe("scoreProseOverlap verdicts", () => {
  const UNRELATED_A =
    "The quarterly report highlights strong growth in the northern region. " +
    "Sales teams exceeded their targets by a wide margin. Management " +
    "credited the new incentive structure for the improvement.";
  const UNRELATED_B =
    "Migratory birds cross the Atlantic twice a year following ancient " +
    "routes. Scientists track their paths using tiny satellite tags. The " +
    "data reveals surprising detours around storm systems.";

  it("scores two unrelated paragraphs as rewritten", () => {
    const result = scoreProseOverlap(UNRELATED_A, UNRELATED_B);
    assert.equal(result.verdict, "rewritten");
    assert.equal(result.breached.length, 0);
  });

  it("scores a paragraph against itself as cosmetic", () => {
    const result = scoreProseOverlap(UNRELATED_A, UNRELATED_A);
    assert.equal(result.verdict, "cosmetic");
    assert.ok(result.breached.includes("run"));
    assert.ok(result.breached.includes("sentences"));
  });

  const ORDER_ORIGINAL =
    "The cat sat on the mat quietly all afternoon. The dog barked loudly " +
    "at the passing mail truck. The bird sang softly from its perch on " +
    "the fence.";
  const REORDERED =
    "The bird sang softly from its perch on the fence. The cat sat on " +
    "the mat quietly all afternoon. The dog barked loudly at the passing " +
    "mail truck.";

  it("catches reordered-but-identical sentences as cosmetic via sentences", () => {
    const result = scoreProseOverlap(ORDER_ORIGINAL, REORDERED);
    assert.equal(result.verdict, "cosmetic");
    assert.ok(result.breached.includes("sentences"));
    // Only 3 sentences total, below the order metric's minimum sample of
    // 4, so order reports its value but cannot fail the gate on its own.
    // The sentences metric is what catches this case.
    assert.ok(!result.breached.includes("order"));
  });

  const SKELETON_ORIGINAL =
    "The company reported a significant increase in revenue this " +
    "quarter. Analysts credited the growth to expanding overseas " +
    "markets. The board approved a new investment plan for next year. " +
    "Employees welcomed the announcement with cautious optimism.";
  const SKELETON_REWRITE =
    "The company posted a significant rise in revenue this quarter. " +
    "Analysts attributed the growth to expanding overseas markets. The " +
    "board approved a fresh investment plan for next year. Employees " +
    "greeted the announcement with cautious optimism.";

  it("breaches order or sentences for a same-skeleton fresh-vocabulary rewrite", () => {
    const result = scoreProseOverlap(SKELETON_ORIGINAL, SKELETON_REWRITE);
    assert.equal(result.verdict, "cosmetic");
    const caught = result.breached.includes("order") || result.breached.includes("sentences");
    assert.ok(caught);
  });

  it("reports a metric below its minimum sample without breaching", () => {
    const twoSentences =
      "The cat sat on the mat quietly all afternoon. The dog barked " +
      "loudly at the passing mail truck.";
    const result = scoreProseOverlap(twoSentences, twoSentences);
    // Perfect match, but only 2 considered sentences: below the minimum
    // sample of 3 for sentences and 4 for order, so neither can breach.
    assert.equal(result.samples.sentences, 2);
    assert.equal(result.metrics.sentences, 1);
    assert.equal(result.samples.order, 2);
    assert.equal(result.metrics.order, 1);
    assert.ok(!result.breached.includes("sentences"));
    assert.ok(!result.breached.includes("order"));
  });
});

describe("scoreProseOverlap contracts", () => {
  const CONTRACT =
    "This document is governed by the standard terms and conditions " +
    "published by the compliance office and reviewed annually by the " +
    "legal department for accuracy.";
  const ORIGINAL = `${CONTRACT} The garden bloomed early this year with unusual warmth.`;
  const REWRITE = `${CONTRACT} Migrating geese passed overhead in a long ragged line.`;

  it("without the contract option, the shared boilerplate reads as copying", () => {
    const result = scoreProseOverlap(ORIGINAL, REWRITE);
    assert.equal(result.verdict, "cosmetic");
  });

  it("a required contract string does not push the verdict to cosmetic", () => {
    const result = scoreProseOverlap(ORIGINAL, REWRITE, { contracts: [CONTRACT] });
    assert.equal(result.verdict, "rewritten");
    assert.equal(result.breached.length, 0);
  });
});

describe("scoreProseOverlap whitelist", () => {
  const TEXT =
    "The widgetizer processed every widgetizer batch overnight without a " +
    "single widgetizer failure reported by staff.";

  it("removes a whitelisted term from consideration", () => {
    const withoutWhitelist = scoreProseOverlap(TEXT, TEXT);
    const withWhitelist = scoreProseOverlap(TEXT, TEXT, { whitelist: ["widgetizer"] });
    assert.equal(withoutWhitelist.samples.run, 15);
    assert.equal(withWhitelist.samples.run, 12);
    assert.ok(withWhitelist.samples.run < withoutWhitelist.samples.run);
    assert.equal(withWhitelist.metrics.run, 12);
  });
});

describe("scoreProseOverlap calibration fixtures", () => {
  const base = readFixture("base.md");

  it("scores an unrelated passage as rewritten", () => {
    const result = scoreProseOverlap(base, readFixture("unrelated.md"));
    assert.equal(result.verdict, "rewritten");
  });

  it("scores a correct blind rewrite as rewritten", () => {
    const result = scoreProseOverlap(base, readFixture("rewrite.md"));
    assert.equal(result.verdict, "rewritten");
  });

  it("scores a lightly edited copy as cosmetic", () => {
    const result = scoreProseOverlap(base, readFixture("edit.md"));
    assert.equal(result.verdict, "cosmetic");
  });

  it("scores a same-order synonym swap as cosmetic", () => {
    const result = scoreProseOverlap(base, readFixture("synonym.md"));
    assert.equal(result.verdict, "cosmetic");
  });

  it("scores a heavier same-order synonym swap as cosmetic", () => {
    const result = scoreProseOverlap(base, readFixture("synonym-heavy.md"));
    assert.equal(result.verdict, "cosmetic");
  });
});
