/**
 * Characterization tests for render.ts, formatEvolveResult. These pin the
 * text an MCP client reads, not the internal shape of render.ts.
 *
 * Build the package first (npx tsc or npm run build -w packages/evomcp).
 * The test script runs against dist/, so this file must compile to
 * dist/render-evolve.test.js for `node --test "dist/*.test.js"` to
 * find it.
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatEvolveResult } from "./render.js";
import type { EvolveResult, RunStats } from "./types.js";

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

// No caller or type states a byte budget for these fields. Only the
// fact that an oversized field does not survive whole is pinned here.
function hugeString(marker: string): string {
  return `${"A".repeat(50_000)}${marker}`;
}

function evolveBase(overrides: Partial<EvolveResult> = {}): EvolveResult {
  return {
    best_patch: "diff --git a/f b/f\n+improved",
    best_score: 10,
    baseline_score: 20,
    fitness_history: [
      { generation: 1, best_score: 18, mean_score: 19 },
      { generation: 2, best_score: 10, mean_score: 14 },
    ],
    verification_report: "verified against fitness_cmd",
    stats: stats(),
    ...overrides,
  };
}

describe("formatEvolveResult", () => {
  it("marks the run complete", () => {
    const text = formatEvolveResult(evolveBase());
    assert.match(text, /COMPLETE/);
  });

  it("computes improvement as baseline minus best", () => {
    const text = formatEvolveResult(evolveBase({ baseline_score: 20, best_score: 10 }));
    // baseline 20 minus best 10 is improvement 10
    assert.match(text, /\b10(\.0+)?\b/);
  });

  it("computes a percentage improvement when baseline is non-zero", () => {
    const text = formatEvolveResult(evolveBase({ baseline_score: 20, best_score: 10 }));
    // 10 divided by 20, times 100, is 50%
    assert.match(text, /\b50(\.0+)?%/);
  });

  it("reports N/A improvement percentage when baseline is zero", () => {
    const text = formatEvolveResult(evolveBase({ baseline_score: 0, best_score: -5 }));
    assert.ok(text.includes("N/A"));
  });

  it("lists each fitness history generation's best and mean score", () => {
    const text = formatEvolveResult(
      evolveBase({
        fitness_history: [
          { generation: 1, best_score: 5, mean_score: 6 },
          { generation: 2, best_score: 3, mean_score: 4 },
          { generation: 3, best_score: 1, mean_score: 2 },
        ],
      }),
    );
    assert.match(text, /\b5(\.0+)?\b/);
    assert.match(text, /\b6(\.0+)?\b/);
    assert.match(text, /\b3(\.0+)?\b/);
    assert.match(text, /\b4(\.0+)?\b/);
    assert.match(text, /\b1(\.0+)?\b/);
    assert.match(text, /\b2(\.0+)?\b/);
  });

  it("shows no generation row for an empty history, one row for a populated one", () => {
    const emptyText = formatEvolveResult(evolveBase({ fitness_history: [] }));
    const populatedText = formatEvolveResult(evolveBase());
    assert.doesNotMatch(emptyText, /\|\s*\d+\s*\|/);
    assert.match(populatedText, /\|\s*1\s*\|/);
  });

  it("shows the best patch text", () => {
    const text = formatEvolveResult(evolveBase({ best_patch: "diff --git a/g b/g\n+unique marker line" }));
    assert.ok(text.includes("diff --git a/g b/g\n+unique marker line"));
  });

  it("truncates a best_patch longer than its limit", () => {
    const huge = hugeString("OVERFLOW_MARKER");
    const text = formatEvolveResult(evolveBase({ best_patch: huge }));
    assert.ok(!text.includes("OVERFLOW_MARKER"));
    assert.ok(text.length < huge.length, "output is shorter than input");
  });

  it("truncates a verification_report longer than its limit", () => {
    const huge = hugeString("OVERFLOW_MARKER");
    const text = formatEvolveResult(evolveBase({ verification_report: huge }));
    assert.ok(!text.includes("OVERFLOW_MARKER"));
    assert.ok(text.length < huge.length, "output is shorter than input");
  });

  it("shows a real token count and an approximate cost caveat for non-negative tokens", () => {
    const text = formatEvolveResult(evolveBase({ stats: stats({ tokens_consumed: 5000 }) }));
    assert.ok(text.includes("5000"));
    assert.match(text, /approximate/i);
  });

  it("shows a direct mode placeholder and no caveat when tokens_consumed is negative", () => {
    const text = formatEvolveResult(evolveBase({ stats: stats({ tokens_consumed: -1 }) }));
    assert.ok(text.includes("N/A"));
    assert.doesNotMatch(text, /approximate/i);
  });

  it("shows duration derived from duration_ms in seconds", () => {
    const text = formatEvolveResult(evolveBase({ stats: stats({ duration_ms: 9900 }) }));
    assert.ok(text.includes("9.9"));
  });

  it("shows the model name from stats", () => {
    const text = formatEvolveResult(evolveBase({ stats: stats({ model: "evolve-model-x" }) }));
    assert.ok(text.includes("evolve-model-x"));
  });
});
