// Structural similarity metrics for the blind-rewrite gate. A rewrite that
// shares long token runs, whole lines, or declaration order with the original
// is a paraphrase and not a rewrite. These metrics make that machine-checkable.

import { matchRate } from "./match-rate.mjs";
import {
  gramStats,
  lineStats,
  orderStats,
  runStats,
} from "./metric-stats.mjs";
import { ngrams, significantLines } from "./text-tokens.mjs";

export { orderSimilarity } from "./metric-stats.mjs";

// `run` counts tokens. The other three are rates between 0 and 1. Every limit
// here comes from measured pairs, not from taste. See metric-stats.mjs.
const DEFAULT_THRESHOLDS = { run: 60, ngram: 0.65, lines: 0.35, order: 0.5 };

// Below these sample sizes a metric reports its value but never fails the gate.
const MIN_SAMPLES = { run: 0, ngram: 20, lines: 3, order: 4 };

export function ngramOverlap(originalTokens, rewriteTokens, size = 4) {
  const source = ngrams(originalTokens, size);
  return matchRate(source, ngrams(rewriteTokens, size));
}

export function identicalLineRate(original, rewrite, whitelist = []) {
  const source = significantLines(original, whitelist);
  return matchRate(source, significantLines(rewrite, whitelist));
}

function resolveSettings(options) {
  const { whitelist = [], ngramSize = 4, thresholds = {} } = options;
  const merged = { ...DEFAULT_THRESHOLDS, ...thresholds };
  return { whitelist, size: ngramSize, thresholds: merged };
}

function collectStats(original, rewrite, settings) {
  const { whitelist } = settings;
  return {
    run: runStats(original, rewrite, whitelist),
    ngram: gramStats(original, rewrite, settings),
    lines: lineStats(original, rewrite, whitelist),
    order: orderStats(original, rewrite, whitelist),
  };
}

function isBreached(stats, threshold, minimum) {
  return stats.sample >= minimum && stats.rate > threshold;
}

export function scoreOverlap(original, rewrite, options = {}) {
  const settings = resolveSettings(options);
  const { thresholds } = settings;
  const stats = collectStats(original, rewrite, settings);
  const metrics = {};
  const samples = {};
  const breached = [];
  for (const key of Object.keys(thresholds)) {
    metrics[key] = stats[key].rate;
    samples[key] = stats[key].sample;
    if (isBreached(stats[key], thresholds[key], MIN_SAMPLES[key])) {
      breached.push(key);
    }
  }
  const verdict = breached.length === 0 ? "rewritten" : "cosmetic";
  return { metrics, samples, thresholds, breached, verdict };
}
