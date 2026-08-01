// Each metric reports a rate and the size of the evidence behind it. A rate over
// a tiny sample is noise. One shared `return null;` in a six-line function is
// convergence, not copying, so the caller needs the sample size to judge it.

import { matchCounts } from "./match-rate.mjs";
import * as text from "./text-tokens.mjs";

function rateOf(counts) {
  if (counts.total === 0) {
    return 0;
  }
  return counts.matched / counts.total;
}

// Tokenizes `value` and removes every contract run from the result, so a
// metric never sees text a contract requires verbatim on both sides.
function tokensOf(value, settings) {
  const tokens = text.tokenize(value, settings.whitelist);
  return text.removeTokenRuns(tokens, settings.contractRuns);
}

export function gramStats(original, rewrite, settings) {
  const source = text.ngrams(tokensOf(original, settings), settings.size);
  const candidate = text.ngrams(tokensOf(rewrite, settings), settings.size);
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

export function runStats(original, rewrite, settings) {
  const source = tokensOf(original, settings);
  const candidate = tokensOf(rewrite, settings);
  return { rate: longestRun(source, candidate), sample: candidate.length };
}

export function lineStats(original, rewrite, settings) {
  const { whitelist, contractRuns } = settings;
  const source = text.significantLines(original, whitelist, contractRuns);
  const candidate = text.significantLines(rewrite, whitelist, contractRuns);
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

// A declaration a contract introduces is required on both sides, so it is
// banned from the order metric the same way a whitelisted name is.
export function orderStats(original, rewrite, settings) {
  const banned = settings.whitelist.concat(settings.contractNames);
  const source = text.declarations(original, banned);
  const candidate = text.declarations(rewrite, banned);
  return { rate: orderSimilarity(source, candidate), sample: candidate.length };
}
