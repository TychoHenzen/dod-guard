/**
 * Characterization tests for render.ts, formatSolveResult pass branch.
 * These pin the text an MCP client reads, not the internal shape of
 * render.ts.
 *
 * Build the package first (npx tsc or npm run build -w packages/evomcp).
 * The test script runs against dist/, so this file must compile to
 * dist/render-solve-pass.test.js for `node --test "dist/*.test.js"` to
 * find it.
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSolveResult } from "./render.js";
import type { RunStats, SolveResult } from "./types.js";

function stats(overrides: Partial<RunStats> = {}): RunStats {
  return {
    plans_sampled: 3,
    plans_deduped: 3,
    candidates_generated: 6,
    tokens_consumed: 15000,
    duration_ms: 1500,
    model: "deepseek-chat",
    ...overrides,
  };
}

// render.ts truncates long fields in a passing solve result. No caller or
// type states a byte budget, so the exact cutoff is not pinned here - only
// that an oversized field does not survive whole.
function hugeString(marker: string): string {
  return `${"A".repeat(50_000)}${marker}`;
}

describe("formatSolveResult, pass outcome", () => {
  it("marks the run as passed", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "diff --git a/x b/x",
      verification_report: "all tests green",
      stats: stats(),
    };
    const text = formatSolveResult(result);
    assert.match(text, /PASSED/);
  });

  it("shows the winning patch text", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "diff --git a/foo.ts b/foo.ts\n+added line",
      verification_report: "ok",
      stats: stats(),
    };
    const text = formatSolveResult(result);
    assert.ok(text.includes("diff --git a/foo.ts b/foo.ts"), "patch content should be present");
  });

  it("shows the verification report text", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "patch",
      verification_report: "12 tests passed, 0 failed",
      stats: stats(),
    };
    const text = formatSolveResult(result);
    assert.ok(text.includes("12 tests passed, 0 failed"));
  });

  it("falls back to a placeholder when patch is missing", () => {
    const result: SolveResult = {
      outcome: "pass",
      verification_report: "ok",
      stats: stats(),
    };
    const text = formatSolveResult(result);
    assert.match(text, /(no patch|none|n\/a)/i);
    assert.doesNotMatch(text, /undefined/);
  });

  it("falls back to a placeholder when verification_report is missing", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "patch",
      stats: stats(),
    };
    const text = formatSolveResult(result);
    assert.match(text, /(no report|none|n\/a)/i);
    assert.doesNotMatch(text, /undefined/);
  });

  it("truncates a patch longer than the limit", () => {
    const huge = hugeString("OVERFLOW_MARKER");
    const result: SolveResult = {
      outcome: "pass",
      patch: huge,
      verification_report: "ok",
      stats: stats(),
    };
    const text = formatSolveResult(result);
    assert.ok(!text.includes("OVERFLOW_MARKER"), "overflow is cut");
    assert.ok(text.length < huge.length, "output is shorter than input");
  });

  it("truncates a verification_report longer than its limit", () => {
    const huge = hugeString("OVERFLOW_MARKER");
    const result: SolveResult = {
      outcome: "pass",
      patch: "p",
      verification_report: huge,
      stats: stats(),
    };
    const text = formatSolveResult(result);
    assert.ok(!text.includes("OVERFLOW_MARKER"));
    assert.ok(text.length < huge.length, "output is shorter than input");
  });

  it("keeps a patch shorter than the limit whole", () => {
    const shortPatch = "diff --git a/short b/short\n+one line change";
    const result: SolveResult = {
      outcome: "pass",
      patch: shortPatch,
      verification_report: "ok",
      stats: stats(),
    };
    const text = formatSolveResult(result);
    assert.ok(text.includes(shortPatch));
  });

  it("shows plans and candidates from stats", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "p",
      verification_report: "r",
      stats: stats({ plans_sampled: 7, candidates_generated: 21 }),
    };
    const text = formatSolveResult(result);
    assert.ok(text.includes("7"));
    assert.ok(text.includes("21"));
  });

  it("shows a real token count and an approximate cost caveat for non-negative tokens", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "p",
      verification_report: "r",
      stats: stats({ tokens_consumed: 42000 }),
    };
    const text = formatSolveResult(result);
    assert.ok(text.includes("42000"));
    assert.match(text, /approximate/i);
  });

  it("shows a direct mode placeholder and no caveat when tokens_consumed is negative", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "p",
      verification_report: "r",
      stats: stats({ tokens_consumed: -1 }),
    };
    const text = formatSolveResult(result);
    assert.ok(text.includes("N/A"));
    assert.doesNotMatch(text, /approximate/i);
  });

  it("shows duration derived from duration_ms in seconds", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "p",
      verification_report: "r",
      stats: stats({ duration_ms: 4200 }),
    };
    const text = formatSolveResult(result);
    assert.ok(text.includes("4.2"));
  });

  it("shows the model name from stats", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "p",
      verification_report: "r",
      stats: stats({ model: "claude-opus-9000" }),
    };
    const text = formatSolveResult(result);
    assert.ok(text.includes("claude-opus-9000"));
  });

  it("shows the degenerate rejection count when rejections exist", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "p",
      verification_report: "r",
      degenerate_rejections: ["candidate-1: hardcoded output", "candidate-2: deleted assertion"],
      stats: stats(),
    };
    const text = formatSolveResult(result);
    assert.ok(text.includes("2"));
    assert.match(text, /[Dd]egenerate/);
  });

  it("omits degenerate rejection info when there are none", () => {
    const result: SolveResult = {
      outcome: "pass",
      patch: "p",
      verification_report: "r",
      degenerate_rejections: [],
      stats: stats(),
    };
    const text = formatSolveResult(result);
    assert.doesNotMatch(text, /[Dd]egenerate rejections/);
  });
});
