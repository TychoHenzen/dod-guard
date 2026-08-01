// Structural similarity metrics for the blind-rewrite gate. A rewrite that
// shares long token runs, whole lines, or declaration order with the original
// is a paraphrase and not a rewrite. These metrics make that machine-checkable.

import {
  gramStats,
  lineStats,
  orderStats,
  runStats,
} from "./metric-stats.mjs";
import * as text from "./text-tokens.mjs";

export { orderSimilarity } from "./metric-stats.mjs";

// `run` counts tokens. The other three are rates between 0 and 1. Every limit
// here comes from measured pairs, not from taste. See metric-stats.mjs.
const DEFAULT_THRESHOLDS = { run: 60, ngram: 0.65, lines: 0.35, order: 0.5 };

// Below these sample sizes a metric reports its value but never fails the gate.
const MIN_SAMPLES = { run: 0, ngram: 20, lines: 3, order: 4 };

function byLengthDescending(left, right) {
  return right.length - left.length;
}

// Contract text is required verbatim on both sides, so it is not evidence of
// copying. It is matched as a token run, not a raw substring. Two spellings
// of the same required block, differing only in whitespace or comments,
// tokenize to the same sequence, so both must be exempt. Longest runs are
// removed first. A shorter contract string that sits inside a longer one
// must never fragment the longer match.
function contractRunsFor(contracts, whitelist) {
  return contracts
    .map((contract) => text.tokenize(contract, whitelist))
    .filter((run) => run.length > 0)
    .sort(byLengthDescending);
}

function resolveSettings(options) {
  const {
    whitelist = [],
    ngramSize = 4,
    thresholds = {},
    contracts = [],
  } = options;
  const merged = { ...DEFAULT_THRESHOLDS, ...thresholds };
  return {
    whitelist,
    size: ngramSize,
    thresholds: merged,
    contractRuns: contractRunsFor(contracts, whitelist),
    contractNames: contracts.flatMap((c) => text.declarations(c, whitelist)),
  };
}

function collectStats(original, rewrite, settings) {
  return {
    run: runStats(original, rewrite, settings),
    ngram: gramStats(original, rewrite, settings),
    lines: lineStats(original, rewrite, settings),
    order: orderStats(original, rewrite, settings),
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
