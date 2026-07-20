/**
 * Convergence and stagnation detection for the evolutionary loop.
 *
 * Pure computation module -- no I/O, no side effects.
 * Used by evolve.ts to decide when to stop or escalate.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface ConvergenceResult {
  converged: boolean;
  similarity: number;
  threshold: number;
  reason: string;
}

export interface StagnationResult {
  stagnated: boolean;
  generations_without_improvement: number;
  patience: number;
  best_in_window: number;
  overall_best: number;
  reason: string;
}

export interface OscillationResult {
  oscillating: boolean;
  pattern: "up-down" | "none";
  amplitude: number;
  reason: string;
}

export interface FullConvergenceReport {
  converged: boolean;
  stagnated: boolean;
  oscillating: boolean;
  convergence: ConvergenceResult;
  stagnation: StagnationResult;
  oscillation: OscillationResult;
  recommendation: "stop" | "continue" | "escalate";
}

export interface FitnessHistoryPoint {
  generation: number;
  best_score: number;
}

export interface ConvergenceOptions {
  convergenceThreshold?: number;
  patience?: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_CONVERGENCE_THRESHOLD = 0.95;
const DEFAULT_PATIENCE = 10;

// ── Math helpers ───────────────────────────────────────────────────────

/** Arithmetic mean of a numeric array. Returns 0 for empty arrays. */
function calcMean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}

/** Population standard deviation: sqrt(sum((x - mean)^2) / n). */
function calcStdev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  let sumSqDiff = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - mean;
    sumSqDiff += diff * diff;
  }
  return Math.sqrt(sumSqDiff / values.length);
}

// ── Detectors ──────────────────────────────────────────────────────────

/**
 * Detect whether a set of scores has converged (low variance relative to mean).
 *
 * Similarity = 1.0 - (stdev / |mean|), clamped to [0, 1].
 * A value >= threshold (default 0.95) indicates convergence.
 *
 * Edge cases:
 * - Empty scores array: returns not converged with similarity 1.0
 * - Mean === 0: similarity is 1.0 (perfect agreement on zero)
 */
export function detectConvergence(
  scores: number[],
  threshold: number = DEFAULT_CONVERGENCE_THRESHOLD,
): ConvergenceResult {
  if (scores.length === 0) {
    return {
      converged: false,
      similarity: 1.0,
      threshold,
      reason: "No scores to evaluate",
    };
  }

  const mean = calcMean(scores);
  let similarity: number;

  if (mean === 0) {
    similarity = 1.0;
  } else {
    const sd = calcStdev(scores, mean);
    similarity = Math.max(0, Math.min(1, 1.0 - sd / Math.abs(mean)));
  }

  const converged = similarity >= threshold;

  return {
    converged,
    similarity,
    threshold,
    reason: converged
      ? `Scores converged (similarity ${similarity.toFixed(3)} >= threshold ${threshold})`
      : `Scores still diverse (similarity ${similarity.toFixed(3)} < threshold ${threshold})`,
  };
}

/**
 * Detect whether fitness has stagnated (no improvement in last N generations).
 *
 * Compares each generation's best_score against the overall best seen so far.
 * If generations since the overall best >= patience, declares stagnation.
 *
 * Edge cases:
 * - Empty history: returns not stagnated
 */
export function detectStagnation(
  history: FitnessHistoryPoint[],
  patience: number = DEFAULT_PATIENCE,
): StagnationResult {
  if (history.length === 0) {
    return {
      stagnated: false,
      generations_without_improvement: 0,
      patience,
      best_in_window: 0,
      overall_best: 0,
      reason: "No history available",
    };
  }

  // Scan for the overall best score and its index
  let overallBest = history[0].best_score;
  let bestIndex = 0;
  for (let i = 1; i < history.length; i++) {
    if (history[i].best_score > overallBest) {
      overallBest = history[i].best_score;
      bestIndex = i;
    }
  }

  const generationsWithoutImprovement = history.length - 1 - bestIndex;
  const stagnated = generationsWithoutImprovement >= patience;

  return {
    stagnated,
    generations_without_improvement: generationsWithoutImprovement,
    patience,
    best_in_window: history[history.length - 1].best_score,
    overall_best: overallBest,
    reason: stagnated
      ? `Stagnated: no improvement for ${generationsWithoutImprovement} generations (patience: ${patience})`
      : `Still improving: ${generationsWithoutImprovement} generations since last improvement (patience: ${patience})`,
  };
}

/**
 * Detect oscillation: scores alternating up-down-up-down.
 *
 * Analyzes the last up-to-5 history points (minimum 4 required) and checks
 * whether consecutive fitness deltas alternate in sign.
 *
 * Edge cases:
 * - Fewer than 4 history points: no oscillation possible
 * - Zero deltas break the alternating pattern
 */
export function detectOscillation(history: FitnessHistoryPoint[]): OscillationResult {
  if (history.length < 4) {
    return {
      oscillating: false,
      pattern: "none",
      amplitude: 0,
      reason: "Insufficient history for oscillation detection (need >= 4 points)",
    };
  }

  // Take last up-to-5 points for the window
  const window = history.slice(-5);
  const scores = window.map((h) => h.best_score);

  // Compute deltas between consecutive scores
  const deltas: number[] = [];
  for (let i = 1; i < scores.length; i++) {
    deltas.push(scores[i] - scores[i - 1]);
  }

  // Check if all consecutive deltas alternate sign
  let oscillating = deltas.length >= 3;
  for (let i = 1; i < deltas.length && oscillating; i++) {
    if (deltas[i - 1] * deltas[i] >= 0) {
      oscillating = false;
    }
  }

  // Amplitude: range of scores in the full history
  let amplitude = 0;
  if (history.length > 0) {
    let min = history[0].best_score;
    let max = history[0].best_score;
    for (let i = 1; i < history.length; i++) {
      if (history[i].best_score < min) min = history[i].best_score;
      if (history[i].best_score > max) max = history[i].best_score;
    }
    amplitude = max - min;
  }

  return {
    oscillating,
    pattern: oscillating ? "up-down" : "none",
    amplitude,
    reason: oscillating
      ? `Oscillation detected: scores alternate up-down pattern (amplitude: ${amplitude.toFixed(2)})`
      : "No oscillation pattern detected",
  };
}

/**
 * Run all three detectors and produce an aggregated report.
 *
 * Recommendation logic:
 * - Oscillation detected -> "escalate" (may need human intervention)
 * - Convergence or stagnation -> "stop"
 * - Otherwise -> "continue"
 */
export function checkConvergence(
  history: FitnessHistoryPoint[],
  scores: number[],
  opts?: ConvergenceOptions,
): FullConvergenceReport {
  const threshold = opts?.convergenceThreshold ?? DEFAULT_CONVERGENCE_THRESHOLD;
  const patience = opts?.patience ?? DEFAULT_PATIENCE;

  const convergence = detectConvergence(scores, threshold);
  const stagnation = detectStagnation(history, patience);
  const oscillation = detectOscillation(history);

  // Determine recommendation
  let recommendation: "stop" | "continue" | "escalate";
  if (oscillation.oscillating) {
    recommendation = "escalate";
  } else if (convergence.converged || stagnation.stagnated) {
    recommendation = "stop";
  } else {
    recommendation = "continue";
  }

  return {
    converged: convergence.converged,
    stagnated: stagnation.stagnated,
    oscillating: oscillation.oscillating,
    convergence,
    stagnation,
    oscillation,
    recommendation,
  };
}
