import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreOverlap } from "./overlap-metrics.mjs";

const words = (count, prefix) => Array.from({ length: count }, (_, index) => `${prefix}${index % 9}`).join(" ");
const proseA = `Alpha beta gamma. Delta epsilon zeta! ${words(60, "w")}. Closing sentence here.`;
const proseB = `Alpha beta gamma. Something else entirely. ${words(60, "w")}. Different ending now.`;
const unrelated = `${words(70, "q")}. ${words(50, "z")}`;
const codeA = "function add(a, b) {\n  const total = a + b;\n  return total * 2;\n}\n".repeat(12);
const codeB = "function sum(x, y) {\n  const out = x + y;\n  return out * 3;\n}\n".repeat(12);

test("prose mode reports run, ngram, order, sentence overlap and fails a copied passage", () => {
  assert.deepEqual(scoreOverlap(proseA, proseB, { mode: "prose" }), {
    run: 60,
    ngram: 0.526_315_789_473_684_2,
    order: 0.913_043_478_260_869_5,
    sample: 69,
    sentences: 0.5,
    pass: false,
  });
});

test("prose mode passes unrelated text and any sample under 40 tokens", () => {
  assert.equal(scoreOverlap(proseA, unrelated, { mode: "prose" }).pass, true);
  assert.deepEqual(scoreOverlap("short text", "short", { mode: "prose" }), {
    run: 1,
    ngram: 0,
    order: 1,
    sample: 2,
    sentences: 0,
    pass: true,
  });
});

test("prose mode drops whitelisted text before scoring", () => {
  const metrics = scoreOverlap(proseA, proseB, { mode: "prose", whitelist: ["Alpha beta gamma"] });
  assert.equal(metrics.sample, 67);
  assert.equal(metrics.sentences, 1 / 3);
});

test("code mode reports line and shape overlap and fails a renamed skeleton", () => {
  assert.deepEqual(scoreOverlap(codeA, codeB, { mode: "code" }), {
    run: 1,
    ngram: 0,
    order: 0.272_727_272_727_272_7,
    sample: 132,
    lines: 0.25,
    shapeNgram: 1,
    pass: false,
  });
});

test("code mode passes unrelated text", () => {
  assert.deepEqual(scoreOverlap(codeA, unrelated, { mode: "code" }), {
    run: 0,
    ngram: 0,
    order: 0,
    sample: 132,
    lines: 0,
    shapeNgram: 0,
    pass: true,
  });
});
