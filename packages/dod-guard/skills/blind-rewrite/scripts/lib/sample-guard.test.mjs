// A rate over a tiny sample is noise. These tests pin the abstain behavior, so a
// later threshold change cannot quietly turn small targets into false alarms.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreOverlap } from "./overlap-metrics.mjs";

describe("small sample handling", () => {
  it("ignores a line rate that rests on one matched line", () => {
    const original = "const a = computeOne(x);\nconst b = computeTwo(y);\n";
    const rewrite = "const a = computeOne(x);\nconst c = other(z);\n";
    const result = scoreOverlap(original, rewrite);
    assert.equal(result.metrics.lines, 0.5);
    assert.ok(result.metrics.lines > result.thresholds.lines);
    assert.equal(result.samples.lines, 1);
    assert.ok(!result.breached.includes("lines"));
  });

  it("abstains on a target too small to measure", () => {
    const original = "function add(a, b) {\n  return a + b;\n}\n";
    const rewrite = "function add(left, right) {\n  return left + right;\n}\n";
    const result = scoreOverlap(original, rewrite);
    assert.equal(result.verdict, "rewritten");
    assert.deepEqual(result.breached, []);
  });

  it("catches a renamed copy whose shared run stays under the limit", () => {
    const original = [
      "function pack(values) {",
      "  const out = [];",
      "  for (const value of values) {",
      "    out.push(value.id, value.kind, value.at, value.by, value.note);",
      "  }",
      "  return out.join(String.fromCharCode(31));",
      "}",
    ].join("\n");
    const rewrite = original.replace("pack", "bundle");
    const result = scoreOverlap(original, rewrite);
    assert.ok(result.metrics.run < result.thresholds.run);
    assert.ok(result.breached.includes("ngram"), result.breached.join(","));
    assert.equal(result.verdict, "cosmetic");
  });
});
