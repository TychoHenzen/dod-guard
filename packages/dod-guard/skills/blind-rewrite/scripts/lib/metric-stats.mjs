// Each metric reports a rate and the size of the evidence behind it. A rate over
// a tiny sample is noise. One shared `return null;` in a six-line function is
// convergence, not copying, so the caller needs the sample size to judge it.

import { matchCounts } from "./match-rate.mjs";
import {
  declarations,
  ngrams,
  significantLines,
  tokenize,
} from "./text-tokens.mjs";

function rateOf(counts) {
  if (counts.total === 0) {
    return 0;
  }
  return counts.matched / counts.total;
}

export function gramStats(original, rewrite, settings) {
  const { whitelist, size } = settings;
  const source = ngrams(tokenize(original, whitelist), size);
  const candidate = ngrams(tokenize(rewrite, whitelist), size);
  const counts = matchCounts(source, candidate);
  return { rate: rateOf(counts), sample: counts.total };
}

// Longest run of tokens the two versions share. Copied blocks produce long
// runs. Convergent boilerplate produces many short ones. This separates the
// two better than any rate does. Measured on files in this repository:
// unrelated pairs score 10 to 13. A real reimplementation of the same seam
// scores 25. A renamed copy scores 209. An identical file scores 508.
function longestRun(left, right) {
  let best = 0;
  let previous = new Array(right.length + 1).fill(0);
  for (const item of left) {
    const row = new Array(right.length + 1).fill(0);
    for (let j = 0; j < right.length; j += 1) {
      row[j + 1] = item === right[j] ? previous[j] + 1 : 0;
      best = Math.max(best, row[j + 1]);
    }
    previous = row;
  }
  return best;
}

export function runStats(original, rewrite, whitelist) {
  const source = tokenize(original, whitelist);
  const candidate = tokenize(rewrite, whitelist);
  return { rate: longestRun(source, candidate), sample: candidate.length };
}

export function lineStats(original, rewrite, whitelist) {
  const source = significantLines(original, whitelist);
  const candidate = significantLines(rewrite, whitelist);
  const counts = matchCounts(source, candidate);
  return { rate: rateOf(counts), sample: counts.matched };
}

function lcsLength(left, right) {
  let previous = new Array(right.length + 1).fill(0);
  for (const item of left) {
    const row = new Array(right.length + 1).fill(0);
    for (let j = 0; j < right.length; j += 1) {
      const carried = Math.max(row[j], previous[j + 1]);
      row[j + 1] = item === right[j] ? previous[j] + 1 : carried;
    }
    previous = row;
  }
  return previous[right.length];
}

export function orderSimilarity(originalNames, rewriteNames) {
  if (rewriteNames.length === 0) {
    return 0;
  }
  return lcsLength(originalNames, rewriteNames) / rewriteNames.length;
}

export function orderStats(original, rewrite, whitelist) {
  const source = declarations(original, whitelist);
  const candidate = declarations(rewrite, whitelist);
  return { rate: orderSimilarity(source, candidate), sample: candidate.length };
}
