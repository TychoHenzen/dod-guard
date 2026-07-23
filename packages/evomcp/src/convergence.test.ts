import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkConvergence,
  detectConvergence,
  detectOscillation,
  detectStagnation,
  type FitnessHistoryPoint,
} from "./convergence.js";

// ── detectConvergence ──────────────────────────────────────────────────

describe("detectConvergence", () => {
  it("returns not converged for empty scores", () => {
    const result = detectConvergence([]);
    assert.equal(result.converged, false);
    assert.equal(result.similarity, 1.0);
  });

  it("detects high convergence (identical scores)", () => {
    const result = detectConvergence([5, 5, 5, 5, 5]);
    assert.equal(result.converged, true);
    assert.ok(result.similarity >= 0.95);
  });

  it("detects low convergence (diverse scores)", () => {
    const result = detectConvergence([1, 10, 5, 20, 15]);
    assert.equal(result.converged, false);
    assert.ok(result.similarity < 0.95);
  });

  it("handles single score", () => {
    const result = detectConvergence([42]);
    assert.equal(result.converged, true);
    assert.equal(result.similarity, 1.0);
  });

  it("respects custom threshold", () => {
    const result = detectConvergence([1, 2, 3, 4, 5], 0.5);
    // Low threshold — easier to converge
    assert.equal(result.threshold, 0.5);
  });

  it("handles all zero scores", () => {
    const result = detectConvergence([0, 0, 0]);
    assert.equal(result.converged, true);
    assert.equal(result.similarity, 1.0);
  });

  it("handles negative scores", () => {
    const result = detectConvergence([-5, -5, -5]);
    assert.equal(result.converged, true);
  });

  it("handles high variance scores with nonzero mean", () => {
    // mean=0 is a special case (similarity=1.0). Use nonzero mean with high variance.
    const result = detectConvergence([1, 50, 100]);
    assert.equal(result.converged, false);
  });
});

// ── detectStagnation ───────────────────────────────────────────────────

describe("detectStagnation", () => {
  it("returns not stagnated for empty history", () => {
    const result = detectStagnation([]);
    assert.equal(result.stagnated, false);
    assert.equal(result.generations_without_improvement, 0);
  });

  it("detects stagnation when best hasn't improved", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 100 },
      { generation: 1, best_score: 95 },
      { generation: 2, best_score: 90 },
      { generation: 3, best_score: 85 },
      { generation: 4, best_score: 80 },
      { generation: 5, best_score: 75 },
      { generation: 6, best_score: 70 },
      { generation: 7, best_score: 65 },
      { generation: 8, best_score: 60 },
      { generation: 9, best_score: 55 },
      { generation: 10, best_score: 50 },
    ];
    // Best was gen 0 (100). 10 gens without improvement >= 10 patience
    const result = detectStagnation(history, 10);
    assert.equal(result.stagnated, true);
    assert.ok(result.generations_without_improvement >= 10);
  });

  it("does not detect stagnation when still improving", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 10 },
      { generation: 1, best_score: 20 },
      { generation: 2, best_score: 30 },
    ];
    const result = detectStagnation(history, 5);
    assert.equal(result.stagnated, false);
  });

  it("uses default patience of 10", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 100 },
      { generation: 1, best_score: 90 },
    ];
    const result = detectStagnation(history);
    assert.equal(result.patience, 10);
    assert.equal(result.stagnated, false); // only 1 gen without improvement
  });

  it("best in middle of history resets counter correctly", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 50 },
      { generation: 1, best_score: 60 },
      { generation: 2, best_score: 100 },
      { generation: 3, best_score: 95 },
      { generation: 4, best_score: 90 },
      { generation: 5, best_score: 85 },
    ];
    // Best at gen 2, 3 gens without improvement
    const result = detectStagnation(history, 3);
    assert.equal(result.stagnated, true);
    assert.equal(result.overall_best, 100);
  });
});

// ── detectOscillation ──────────────────────────────────────────────────

describe("detectOscillation", () => {
  it("returns no oscillation for insufficient history", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 10 },
      { generation: 1, best_score: 20 },
    ];
    const result = detectOscillation(history);
    assert.equal(result.oscillating, false);
  });

  it("detects up-down oscillation pattern", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 10 },
      { generation: 1, best_score: 30 },
      { generation: 2, best_score: 15 },
      { generation: 3, best_score: 25 },
      { generation: 4, best_score: 20 },
    ];
    // Deltas: +20, -15, +10, -5 — alternating signs
    const result = detectOscillation(history);
    assert.equal(result.oscillating, true);
    assert.equal(result.pattern, "up-down");
  });

  it("does not detect oscillation on monotonic improvement", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 10 },
      { generation: 1, best_score: 20 },
      { generation: 2, best_score: 30 },
      { generation: 3, best_score: 40 },
      { generation: 4, best_score: 50 },
    ];
    const result = detectOscillation(history);
    assert.equal(result.oscillating, false);
  });

  it("does not detect oscillation on monotonic decline", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 50 },
      { generation: 1, best_score: 40 },
      { generation: 2, best_score: 30 },
      { generation: 3, best_score: 20 },
      { generation: 4, best_score: 10 },
    ];
    const result = detectOscillation(history);
    assert.equal(result.oscillating, false);
  });

  it("reports correct amplitude", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 0 },
      { generation: 1, best_score: 100 },
      { generation: 2, best_score: 0 },
      { generation: 3, best_score: 100 },
    ];
    const result = detectOscillation(history);
    assert.equal(result.amplitude, 100);
  });
});

// ── checkConvergence (aggregate) ───────────────────────────────────────

describe("checkConvergence", () => {
  it("recommends continue for healthy diverse progress", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 10 },
      { generation: 1, best_score: 20 },
    ];
    const scores = [15, 25, 35, 45];
    const report = checkConvergence(history, scores);
    assert.equal(report.recommendation, "continue");
    assert.equal(report.converged, false);
    assert.equal(report.stagnated, false);
    assert.equal(report.oscillating, false);
  });

  it("recommends stop on convergence", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 99 },
      { generation: 1, best_score: 100 },
      { generation: 2, best_score: 99 },
    ];
    const scores = [99, 100, 99, 100, 99];
    const report = checkConvergence(history, scores, { convergenceThreshold: 0.01 });
    assert.equal(report.recommendation, "stop");
  });

  it("recommends stop on stagnation", () => {
    const history: FitnessHistoryPoint[] = Array.from({ length: 15 }, (_, i) => ({
      generation: i,
      best_score: i === 0 ? 100 : 90 - i,
    }));
    const scores = [50, 50, 50, 50];
    const report = checkConvergence(history, scores, { patience: 5 });
    assert.equal(report.recommendation, "stop");
    assert.equal(report.stagnated, true);
  });

  it("recommends escalate on oscillation", () => {
    const history: FitnessHistoryPoint[] = [
      { generation: 0, best_score: 10 },
      { generation: 1, best_score: 30 },
      { generation: 2, best_score: 10 },
      { generation: 3, best_score: 30 },
    ];
    const scores = [15, 25, 15, 25];
    const report = checkConvergence(history, scores);
    assert.equal(report.recommendation, "escalate");
    assert.equal(report.oscillating, true);
  });
});
