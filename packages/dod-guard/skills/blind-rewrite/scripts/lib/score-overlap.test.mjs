import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreOverlap } from "./overlap-metrics.mjs";

const SEAM = ["findPath", "grid", "start", "goal"];

const ORIGINAL = [
  "export function findPath(grid, start, goal) {",
  "  const open = [start];",
  "  const seen = new Set();",
  "  while (open.length > 0) {",
  "    const node = open.shift();",
  "    if (node === goal) return trace(node);",
  "    for (const next of neighbours(grid, node)) {",
  "      if (seen.has(next)) continue;",
  "      seen.add(next);",
  "      open.push(next);",
  "    }",
  "  }",
  "  return null;",
  "}",
].join("\n");

const REWRITE = [
  "export function findPath(grid, start, goal) {",
  "  const frontier = new PriorityQueue();",
  "  frontier.push(start, 0);",
  "  const cameFrom = new Map([[key(start), null]]);",
  "  while (!frontier.empty()) {",
  "    const current = frontier.pop();",
  "    if (same(current, goal)) return reconstruct(cameFrom, current);",
  "    for (const jump of jumpPoints(grid, current, goal)) {",
  "      if (cameFrom.has(key(jump))) continue;",
  "      cameFrom.set(key(jump), current);",
  "      frontier.push(jump, estimate(jump, goal));",
  "    }",
  "  }",
  "  return null;",
  "}",
].join("\n");

describe("scoreOverlap", () => {
  it("reports a renamed-variable edit as cosmetic", () => {
    const renamed = ORIGINAL.replace(/open/g, "queue").replace(/seen/g, "kept");
    const result = scoreOverlap(ORIGINAL, renamed, { whitelist: SEAM });
    assert.equal(result.verdict, "cosmetic");
    assert.ok(result.breached.includes("ngram"), result.breached.join(","));
    assert.ok(result.metrics.ngram > 0.65, `ngram was ${result.metrics.ngram}`);
  });

  it("catches a copied block that a header rename left intact", () => {
    const doubled = `${ORIGINAL}\n${ORIGINAL.replace("findPath", "findRoute")}`;
    const renamed = doubled.replace("export function", "function");
    const result = scoreOverlap(doubled, renamed, { whitelist: SEAM });
    assert.ok(result.breached.includes("run"), result.breached.join(","));
    assert.ok(result.metrics.run > 60, `run was ${result.metrics.run}`);
  });

  it("reports a reformatted copy as cosmetic", () => {
    const spaced = ORIGINAL.replace(/\n/g, "\n\n");
    const result = scoreOverlap(ORIGINAL, spaced, { whitelist: SEAM });
    assert.equal(result.verdict, "cosmetic");
    assert.equal(result.metrics.lines, 1);
  });

  it("reports a structurally different implementation as rewritten", () => {
    const result = scoreOverlap(ORIGINAL, REWRITE, { whitelist: SEAM });
    const seen = JSON.stringify(result.metrics);
    assert.equal(result.verdict, "rewritten", seen);
    assert.deepEqual(result.breached, []);
  });

  it("keeps the shared seam signature out of the line metric", () => {
    const bare = scoreOverlap(ORIGINAL, REWRITE);
    const result = scoreOverlap(ORIGINAL, REWRITE, { whitelist: SEAM });
    assert.equal(bare.samples.lines, 2);
    assert.equal(result.samples.lines, 1);
  });

  it("honours caller-supplied thresholds", () => {
    const options = { whitelist: SEAM, thresholds: { ngram: 0.99 } };
    const result = scoreOverlap(ORIGINAL, ORIGINAL, options);
    assert.equal(result.verdict, "cosmetic");
    assert.equal(result.metrics.ngram, 1);
  });
});
