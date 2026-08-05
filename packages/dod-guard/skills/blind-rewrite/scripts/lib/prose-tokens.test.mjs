import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jaccard, paragraphs, proseTokens, sentences } from "./prose-tokens.mjs";

describe("proseTokens", () => {
  it("lowercases words and drops punctuation", () => {
    const actual = proseTokens("The Fox, quick and bold!");
    assert.deepEqual(actual, ["the", "fox", "quick", "and", "bold"]);
  });

  it("keeps a markdown heading line as tokens, not deleted", () => {
    const actual = proseTokens("# Getting Started");
    assert.deepEqual(actual, ["getting", "started"]);
  });

  it("strips a fenced code block before tokenizing", () => {
    const text = "Intro text.\n```\nconst x = deleteEverything();\n```\nOutro text.";
    const actual = proseTokens(text);
    assert.equal(actual.includes("deleteeverything"), false);
    assert.deepEqual(actual, ["intro", "text", "outro", "text"]);
  });

  it("keeps inner apostrophes and hyphens as one token", () => {
    const actual = proseTokens("don't rebuild state-of-the-art tools");
    assert.deepEqual(actual, ["don't", "rebuild", "state-of-the-art", "tools"]);
  });

  it("removes whitelisted tokens case-insensitively", () => {
    const actual = proseTokens("Call the AcmeWidget helper now", ["AcmeWidget"]);
    assert.deepEqual(actual, ["call", "the", "helper", "now"]);
  });
});

describe("sentences", () => {
  it("does not split on e.g. or a decimal number", () => {
    const text = "Use small tools, e.g. hammers and saws. The cost is 3.5 dollars.";
    const actual = sentences(text);
    assert.deepEqual(actual, [
      "Use small tools, e.g. hammers and saws.",
      "The cost is 3.5 dollars.",
    ]);
  });

  it("keeps a markdown heading as its own sentence", () => {
    const text = "# Getting Started\nRead this first.";
    assert.deepEqual(sentences(text), ["# Getting Started", "Read this first."]);
  });

  it("turns a three-item list into three sentences", () => {
    const text = "- first item\n- second item\n- third item";
    assert.deepEqual(sentences(text), ["- first item", "- second item", "- third item"]);
  });

  it("strips a fenced code block before splitting sentences", () => {
    const text = "Before.\n```\nif (x) { return 1.5; }\n```\nAfter.";
    assert.deepEqual(sentences(text), ["Before.", "After."]);
  });

  it("drops empty results", () => {
    assert.deepEqual(sentences(""), []);
  });
});

describe("paragraphs", () => {
  it("splits on one or more blank lines", () => {
    const text = "First block.\nStill first.\n\n\nSecond block.";
    assert.deepEqual(paragraphs(text), ["First block.\nStill first.", "Second block."]);
  });

  it("drops empty paragraphs", () => {
    const text = "\n\nOnly block.\n\n\n";
    assert.deepEqual(paragraphs(text), ["Only block."]);
  });
});

describe("jaccard", () => {
  it("returns 0 for two empty arrays", () => {
    assert.equal(jaccard([], []), 0);
  });

  it("returns 1 for identical token sets", () => {
    assert.equal(jaccard(["a", "b", "c"], ["a", "b", "c"]), 1);
  });

  it("returns 0 for disjoint token sets", () => {
    assert.equal(jaccard(["a", "b"], ["c", "d"]), 0);
  });

  it("returns the intersection over union for partly shared sets", () => {
    // {a,b,c} vs {b,c,d}: intersection {b,c}=2, union {a,b,c,d}=4 -> 0.5
    assert.equal(jaccard(["a", "b", "c"], ["b", "c", "d"]), 0.5);
  });
});
