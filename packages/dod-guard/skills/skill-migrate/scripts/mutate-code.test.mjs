import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { applyMutations, seededRandom, MUTATORS } from "./mutate-code.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, "mutate-code.mjs");

const FIXTURE = `function computeSum(a, b) {
  let total = 0;
  for (let i = 0; i < a; i++) {
    total = total + i;
  }
  return total === b;
}

function computeProduct(x, y) {
  return x * y;
}
`;

describe("seededRandom", () => {
  it("produces the same sequence for the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
  });

  it("produces floats between 0 and 1", () => {
    const rng = seededRandom(7);
    for (let i = 0; i < 20; i++) {
      const value = rng();
      assert.ok(value >= 0 && value < 1.0000001, `expected ${value} in [0,1)`);
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = seededRandom(1);
    const b = seededRandom(2);
    assert.notEqual(a(), b());
  });
});

describe("MUTATORS", () => {
  it("exports all four mutation types", () => {
    assert.deepEqual(Object.keys(MUTATORS).sort(), ["bug", "dead-code", "rename", "shuffle"]);
  });
});

describe("applyMutations - each type produces a diff", () => {
  for (const type of ["rename", "dead-code", "shuffle", "bug"]) {
    it(`${type} changes the content`, () => {
      const { content, mutations } = applyMutations(FIXTURE, {
        count: 1,
        types: [type],
        language: "javascript",
        seed: 123,
      });
      assert.notEqual(content, FIXTURE, `${type} should have produced a diff`);
      assert.equal(mutations.length, 1);
      assert.equal(mutations[0].type, type);
    });
  }
});

describe("applyMutations - rename", () => {
  it("changes an identifier name consistently", () => {
    const { content, mutations } = applyMutations(FIXTURE, {
      count: 1,
      types: ["rename"],
      seed: 5,
    });
    const { before, after } = mutations[0];
    assert.notEqual(before, after);
    assert.ok(!new RegExp(`\\b${before}\\b`).test(content), "old name should be gone");
    assert.ok(new RegExp(`\\b${after}\\b`).test(content), "new name should be present");
  });
});

describe("applyMutations - dead-code", () => {
  it("adds lines to the file", () => {
    const { content } = applyMutations(FIXTURE, {
      count: 1,
      types: ["dead-code"],
      seed: 9,
    });
    const originalLines = FIXTURE.split("\n").length;
    const mutatedLines = content.split("\n").length;
    assert.ok(mutatedLines > originalLines, "dead-code mutation should add lines");
  });
});

describe("applyMutations - shuffle", () => {
  it("changes declaration order but preserves all content", () => {
    const { content, mutations } = applyMutations(FIXTURE, {
      count: 1,
      types: ["shuffle"],
      seed: 3,
    });
    assert.equal(mutations[0].type, "shuffle");
    assert.notEqual(mutations[0].before, mutations[0].after);

    const originalFirstFn = FIXTURE.indexOf("function computeSum");
    const originalSecondFn = FIXTURE.indexOf("function computeProduct");
    const mutatedFirstFn = content.indexOf("function computeSum");
    const mutatedSecondFn = content.indexOf("function computeProduct");
    assert.ok(originalFirstFn < originalSecondFn);
    assert.ok(mutatedFirstFn > mutatedSecondFn, "order should have flipped");

    for (const needle of ["function computeSum", "function computeProduct", "total + i", "x * y"]) {
      assert.ok(content.includes(needle), `mutated content should still include "${needle}"`);
    }
  });
});

describe("applyMutations - bug", () => {
  it("changes exactly one expression per application", () => {
    const { content, mutations } = applyMutations(FIXTURE, {
      count: 1,
      types: ["bug"],
      seed: 11,
    });
    assert.equal(mutations.length, 1);
    const { before, after } = mutations[0];
    assert.notEqual(before, after);

    const originalLines = FIXTURE.split("\n");
    const mutatedLines = content.split("\n");
    const diffLines = mutatedLines.filter((line, i) => line !== originalLines[i]);
    assert.equal(diffLines.length, 1, "exactly one line should differ");
  });
});

describe("applyMutations - seed reproducibility", () => {
  it("produces identical output for the same seed", () => {
    const runA = applyMutations(FIXTURE, { count: 3, seed: 55 });
    const runB = applyMutations(FIXTURE, { count: 3, seed: 55 });
    assert.equal(runA.content, runB.content);
    assert.deepEqual(runA.mutations, runB.mutations);
  });

  it("can produce different output for a different seed", () => {
    const runA = applyMutations(FIXTURE, { count: 3, seed: 1 });
    const runB = applyMutations(FIXTURE, { count: 3, seed: 999 });
    assert.notEqual(runA.content, runB.content);
  });
});

describe("CLI", () => {
  it("exits 3 with a usage message when --input is missing", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--out=/tmp/whatever.js"], {
      encoding: "utf-8",
    });
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage: mutate-code\.mjs/);
  });

  it("exits 3 with a usage message when no args are given", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH], { encoding: "utf-8" });
    assert.equal(result.status, 3);
  });
});
