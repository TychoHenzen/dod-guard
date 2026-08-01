import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregate, judgeSimplicity } from "./simplicity.mjs";

function scan(...units) {
  return { units };
}

function unit(file, rules, errorRules = {}) {
  const items = Object.entries(errorRules).flatMap(([rule, count]) =>
    Array.from({ length: count }, () => ({ rule, severity: "error" })),
  );
  return { file, rules, items };
}

describe("aggregate", () => {
  it("sums the tangle score across every file in the scan", () => {
    const one = aggregate(scan(unit("a.ts", { complexity: 2 })));
    const two = aggregate(
      scan(unit("a.ts", { complexity: 1 }), unit("b.ts", { complexity: 1 })),
    );
    assert.equal(one.tangle, two.tangle);
  });

  it("counts error-severity violations by rule", () => {
    const result = aggregate(scan(unit("a.ts", {}, { complexity: 2 })));
    assert.equal(result.errorsByRule.complexity, 2);
  });

  it("ignores warning-severity items", () => {
    const withWarning = {
      file: "a.ts",
      rules: {},
      items: [{ rule: "complexity", severity: "warning" }],
    };
    assert.deepEqual(aggregate(scan(withWarning)).errorsByRule, {});
  });

  // Biome owns line length, and a long line says nothing about tangle. Counting
  // it would fail a rewrite that is genuinely simpler.
  it("ignores an error on a rule that carries no weight", () => {
    const result = aggregate(scan(unit("a.ts", {}, { "line-length": 9 })));
    assert.deepEqual(result.errorsByRule, {});
  });

  it("lists the files it scanned", () => {
    const result = aggregate(scan(unit("a.ts", {}), unit("b.ts", {})));
    assert.deepEqual(result.files, ["a.ts", "b.ts"]);
  });

  it("reports zero for an empty scan", () => {
    assert.equal(aggregate(scan()).tangle, 0);
  });
});

describe("judgeSimplicity", () => {
  const before = aggregate(scan(unit("a.ts", { complexity: 10 })));

  it("passes a rewrite that lowers the tangle score", () => {
    const after = aggregate(scan(unit("a.ts", { complexity: 4 })));
    assert.equal(judgeSimplicity(before, after).verdict, "simpler");
  });

  it("fails a rewrite that raises the tangle score", () => {
    const after = aggregate(scan(unit("a.ts", { complexity: 14 })));
    assert.equal(judgeSimplicity(before, after).verdict, "not-simpler");
  });

  it("fails a rewrite that only moved the complexity sideways", () => {
    const after = aggregate(scan(unit("a.ts", { complexity: 10 })));
    assert.equal(judgeSimplicity(before, after).verdict, "not-simpler");
  });

  it("passes a rewrite that split one file into several smaller ones", () => {
    const after = aggregate(
      scan(unit("a.ts", { complexity: 2 }), unit("b.ts", { complexity: 2 })),
    );
    assert.equal(judgeSimplicity(before, after).verdict, "simpler");
  });

  it("reports the gain as a fraction of the original score", () => {
    const after = aggregate(scan(unit("a.ts", { complexity: 5 })));
    assert.equal(judgeSimplicity(before, after).gain, 0.5);
  });

  it("fails when a hard violation count climbs, even on a lower score", () => {
    const start = aggregate(
      scan(unit("a.ts", { complexity: 10 }, { complexity: 1 })),
    );
    const after = aggregate(
      scan(unit("a.ts", { complexity: 4 }, { "nesting-depth": 2 })),
    );
    const result = judgeSimplicity(start, after);
    assert.equal(result.verdict, "regressed");
    assert.deepEqual(result.regressions, [
      { rule: "nesting-depth", before: 0, after: 2 },
    ]);
  });

  it("allows a hard violation count to fall", () => {
    const start = aggregate(
      scan(unit("a.ts", { complexity: 10 }, { complexity: 3 })),
    );
    const after = aggregate(
      scan(unit("a.ts", { complexity: 4 }, { complexity: 1 })),
    );
    assert.equal(judgeSimplicity(start, after).verdict, "simpler");
  });

  it("holds a rewrite to a minimum gain when one is set", () => {
    const after = aggregate(scan(unit("a.ts", { complexity: 9 })));
    const result = judgeSimplicity(before, after, { minGain: 0.25 });
    assert.equal(result.verdict, "not-simpler");
  });

  // A scan that found no files is far more often a wrong path than a rewrite
  // that deleted everything. Passing it would accept an unmeasured result.
  it("fails when the rewrite scan found no files at all", () => {
    const result = judgeSimplicity(before, aggregate(scan()));
    assert.equal(result.verdict, "empty");
  });
});
