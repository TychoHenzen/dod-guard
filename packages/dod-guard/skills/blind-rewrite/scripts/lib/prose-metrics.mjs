// Prose overlap gate: is the rewrite a rewrite of the original, or a
// paraphrase of it? Four metrics: a shared token run, shared 4-token
// windows, sentences that still closely match, and whether the matched
// sentences keep the original's order. The last one is why this module
// exists - it catches a passage that says the same things, in the same
// order, in fresher words.

import { gradeStats } from "./grade-stats.mjs";
import { longestRun, orderSimilarity } from "./metric-stats.mjs";
import { matchCounts } from "./match-rate.mjs";
import { ngrams, removeTokenRuns } from "./text-tokens.mjs";
import { proseTokens } from "./prose-tokens.mjs";
import { sentenceStats, proseOrderStats } from "./sentence-match.mjs";

export { orderSimilarity };

// Every limit here comes from measured pairs, not from taste.
// Each fixture in scripts/fixtures/prose/ was scored against base.md.
// The order column uses ALIGNMENT_FLOOR = 0.35 from sentence-match.mjs.
//   unrelated.md, honest, other subject. run 2. ngram 0.000.
//     sentences 0.000 over 9. order 0.000 over 0.
//   rewrite.md, honest, a real rewrite. run 5. ngram 0.012.
//     sentences 0.000 over 21. order 1.000 over 1, under the sample of 4.
//   edit.md, cosmetic, a few words swapped. run 57. ngram 0.921.
//     sentences 1.000. order 1.000 over 13.
//   synonym.md, cosmetic, same order. run 24. ngram 0.656.
//     sentences 1.000. order 1.000 over 13.
//   synonym-heavy.md, cosmetic, most words replaced. run 14. ngram 0.289.
//     sentences 0.385 over 13. order 1.000 over 11.
// run and ngram separate the honest pairs from the rest on their own.
// sentences catches edit.md and synonym.md, and scores 0 on both honest
// fixtures. It misses synonym-heavy.md, whose sentences fall under the
// 0.6 near-duplicate floor even though the passage keeps the old order.
// order is what catches that one. At an alignment floor of 0.35 both
// honest fixtures stay below order's minimum sample of 4. The honest side
// only starts producing a sample at a floor of 0.25 or below.
// synonym-heavy.md produces 11 aligned pairs there, all in the old order.
// The limit of 0.6 sits below the 1.000 every cosmetic fixture scores.
const DEFAULT_THRESHOLDS = { run: 15, ngram: 0.2, sentences: 0.4, order: 0.6 };

// Below these sample sizes a metric reports its value but never fails the
// gate, exactly as overlap-metrics.mjs does.
const MIN_SAMPLES = { run: 0, ngram: 20, sentences: 3, order: 4 };

function byLengthDescending(left, right) {
  return right.length - left.length;
}

// Contract text is required verbatim on both sides, so it is never
// evidence of copying. Longest runs are removed first, so a shorter
// contract string cannot fragment a longer one it sits inside of.
function contractRunsFor(contracts, whitelist) {
  return contracts
    .map((contract) => proseTokens(contract, whitelist))
    .filter((run) => run.length > 0)
    .sort(byLengthDescending);
}

function resolveSettings(options) {
  const { whitelist = [], ngramSize = 4, thresholds = {}, contracts = [] } = options;
  return {
    whitelist,
    size: ngramSize,
    thresholds: { ...DEFAULT_THRESHOLDS, ...thresholds },
    contractRuns: contractRunsFor(contracts, whitelist),
  };
}

function tokensOf(text, settings) {
  const tokens = proseTokens(text, settings.whitelist);
  return removeTokenRuns(tokens, settings.contractRuns);
}

function runStats(original, rewrite, settings) {
  const source = tokensOf(original, settings);
  const candidate = tokensOf(rewrite, settings);
  return { rate: longestRun(source, candidate), sample: candidate.length };
}

function rateOf(counts) {
  return counts.total === 0 ? 0 : counts.matched / counts.total;
}

function gramStats(original, rewrite, settings) {
  const source = ngrams(tokensOf(original, settings), settings.size);
  const candidate = ngrams(tokensOf(rewrite, settings), settings.size);
  const counts = matchCounts(source, candidate);
  return { rate: rateOf(counts), sample: counts.total };
}

function collectStats(original, rewrite, settings) {
  return {
    run: runStats(original, rewrite, settings),
    ngram: gramStats(original, rewrite, settings),
    sentences: sentenceStats(original, rewrite, settings),
    order: proseOrderStats(original, rewrite, settings),
  };
}

// Contract content is required verbatim, so any overlap it causes is not
// evidence of copying. removeTokenRuns strips contiguous matches, but table
// rows and inline references scatter contract tokens among free text, so run
// matching alone underestimates required content. The scale factor instead
// counts how many of the document's tokens belong to any contract entry
// (bag-of-words), then scales thresholds by 1/(1-f) so the gate judges
// only the free portion.
function contractTokenBag(contractRuns) {
  const bag = new Set();
  for (const run of contractRuns) {
    for (const token of run) bag.add(token);
  }
  return bag;
}

function contractFraction(text, settings, bag) {
  const raw = proseTokens(text, settings.whitelist);
  if (raw.length === 0) return 0;
  const matched = raw.filter((t) => bag.has(t)).length;
  return matched / raw.length;
}

function contractScaleFactor(original, rewrite, settings) {
  if (settings.contractRuns.length === 0) return 1;
  const bag = contractTokenBag(settings.contractRuns);
  const fraction = Math.max(
    contractFraction(original, settings, bag),
    contractFraction(rewrite, settings, bag),
  );
  return fraction >= 1 ? 1 : 1 / (1 - fraction);
}

function scaleThresholds(thresholds, factor) {
  if (factor <= 1) return thresholds;
  const scaled = {};
  for (const key of Object.keys(thresholds)) {
    scaled[key] = thresholds[key] * factor;
  }
  return scaled;
}

export function scoreProseOverlap(original, rewrite, options = {}) {
  const settings = resolveSettings(options);
  const stats = collectStats(original, rewrite, settings);
  const factor = contractScaleFactor(original, rewrite, settings);
  const adjusted = scaleThresholds(settings.thresholds, factor);
  return gradeStats(stats, adjusted, MIN_SAMPLES);
}
