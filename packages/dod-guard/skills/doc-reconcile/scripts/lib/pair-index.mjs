// Groups claim units that share vocabulary into candidate conflict pairs. This
// module does not decide whether a pair truly conflicts - that call belongs to a
// later subagent step. It only keeps recall high while bounding queue size, using
// an inverted index so a large repository never scores every claim against every
// other claim.

import { claimTokens } from "./claim-tokens.mjs";

const DEFAULT_THRESHOLD = 0.35;
const DEFAULT_MAX_PER_CLAIM = 3;
const DEFAULT_MIN_TOKENS = 6;

// A token counts as rare when at most this many claims in the whole corpus
// carry it. File paths, CLI flags and numbers naturally clear this bar.
// Common prose words almost never do. A shared rare token is strong evidence
// two claims talk about the same thing, not just shared vocabulary.
const RARE_DOC_FREQUENCY = 2;
const RARE_TOKEN_BONUS = 0.25;

function buildTokenSets(claims) {
  return claims.map((claim) => new Set(claimTokens(claim.text)));
}

// A claim this short carries no assertion: a bare heading, a table divider,
// a one-word list item. It can share every token with an unrelated claim of
// the same shape and still never conflict with anything. Drop it before the
// index sees it, so it can never anchor a candidate pair.
function filterByMinTokens(claims, minTokens) {
  return claims.filter((claim) => claimTokens(claim.text).length >= minTokens);
}

function buildInvertedIndex(tokenSets) {
  const index = new Map();
  tokenSets.forEach((tokens, claimIndex) => {
    for (const token of tokens) {
      if (!index.has(token)) {
        index.set(token, []);
      }
      index.get(token).push(claimIndex);
    }
  });
  return index;
}

function computeDocFrequency(index) {
  const freq = new Map();
  for (const [token, docs] of index) {
    freq.set(token, docs.length);
  }
  return freq;
}

// `docs` lists are built by iterating claim indices in ascending order, so each
// list is already sorted. Every generated key therefore has i < j, giving each
// unordered pair a single canonical key.
function collectCandidateKeys(index) {
  const keys = new Set();
  for (const docs of index.values()) {
    for (let x = 0; x < docs.length; x++) {
      for (let y = x + 1; y < docs.length; y++) {
        keys.add(`${docs[x]}:${docs[y]}`);
      }
    }
  }
  return keys;
}

function pairAllowed(a, b) {
  if (a.file !== b.file) {
    return true;
  }
  return a.heading !== b.heading;
}

function sharedRareBonus(tokensA, tokensB, freq) {
  let bonus = 0;
  for (const token of tokensA) {
    if (tokensB.has(token) && (freq.get(token) ?? 0) <= RARE_DOC_FREQUENCY) {
      bonus += RARE_TOKEN_BONUS;
    }
  }
  return bonus;
}

function jaccard(tokensA, tokensB) {
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function scorePair(tokensA, tokensB, freq) {
  const base = jaccard(tokensA, tokensB);
  const bonus = sharedRareBonus(tokensA, tokensB, freq);
  return Math.min(1, base + bonus);
}

// Orders two claims by file then line, independent of their position in the
// input array. Without this, shuffling the input could flip which claim
// lands in `.a` versus `.b`, breaking the determinism the sort relies on.
function orderByLocation(claimA, claimB) {
  const cmp = compareLocation(claimA.file, claimA.startLine, claimB.file, claimB.startLine);
  return cmp <= 0 ? [claimA, claimB] : [claimB, claimA];
}

function buildCandidates(claims, tokenSets, index, freq) {
  const candidates = [];
  for (const key of collectCandidateKeys(index)) {
    const [i, j] = key.split(":").map(Number);
    if (!pairAllowed(claims[i], claims[j])) {
      continue;
    }
    const score = scorePair(tokenSets[i], tokenSets[j], freq);
    const [a, b] = orderByLocation(claims[i], claims[j]);
    candidates.push({ score, i, j, a, b });
  }
  return candidates;
}

// Tie-break key for ranking one claim's candidates: the other claim in the pair,
// identified by file and line. This keeps the cap deterministic when two
// candidates for the same claim land on the same score.
function otherClaimKey(candidate, forIndex) {
  const other = candidate.i === forIndex ? candidate.b : candidate.a;
  return `${other.file}:${other.startLine}`;
}

function groupByClaim(candidates) {
  const byClaim = new Map();
  for (const candidate of candidates) {
    for (const idx of [candidate.i, candidate.j]) {
      if (!byClaim.has(idx)) {
        byClaim.set(idx, []);
      }
      byClaim.get(idx).push(candidate);
    }
  }
  return byClaim;
}

function topSurvivors(list, forIndex, maxPerClaim) {
  const sorted = [...list].sort(
    (x, y) => y.score - x.score || otherClaimKey(x, forIndex).localeCompare(otherClaimKey(y, forIndex)),
  );
  return new Set(sorted.slice(0, maxPerClaim));
}

// Keeps a candidate only when it ranks in the top `maxPerClaim` for BOTH
// claims it connects. A claim with many mediocre matches should not flood
// the queue, even when the pair's other side has few matches of its own.
function capPerClaim(candidates, maxPerClaim) {
  const byClaim = groupByClaim(candidates);
  const survivors = new Map();
  for (const [idx, list] of byClaim) {
    survivors.set(idx, topSurvivors(list, idx, maxPerClaim));
  }
  return candidates.filter((c) => survivors.get(c.i).has(c) && survivors.get(c.j).has(c));
}

function compareLocation(leftFile, leftLine, rightFile, rightLine) {
  if (leftFile !== rightFile) {
    return leftFile < rightFile ? -1 : 1;
  }
  return leftLine - rightLine;
}

function byScoreThenLocation(x, y) {
  if (y.score !== x.score) {
    return y.score - x.score;
  }
  const byA = compareLocation(x.a.file, x.a.startLine, y.a.file, y.a.startLine);
  if (byA !== 0) {
    return byA;
  }
  return compareLocation(x.b.file, x.b.startLine, y.b.file, y.b.startLine);
}

function finalizeOrder(candidates) {
  return [...candidates].sort(byScoreThenLocation).map((c) => ({ score: c.score, a: c.a, b: c.b }));
}

// Builds candidate conflict pairs from claim units produced by doc-corpus.mjs.
// Options: `threshold` (default 0.35) drops low-scoring pairs. `maxPerClaim`
// (default 3) bounds how many pairs survive per claim. `minTokens` (default 6)
// drops claims too short to carry an assertion before pairing starts. Output
// is sorted by score descending, then by file and line of each side. Two
// runs over the same input always produce the same array.
export function buildPairs(
  claims,
  {
    threshold = DEFAULT_THRESHOLD,
    maxPerClaim = DEFAULT_MAX_PER_CLAIM,
    minTokens = DEFAULT_MIN_TOKENS,
  } = {},
) {
  const filtered = filterByMinTokens(claims, minTokens);
  const tokenSets = buildTokenSets(filtered);
  const index = buildInvertedIndex(tokenSets);
  const freq = computeDocFrequency(index);
  const candidates = buildCandidates(filtered, tokenSets, index, freq);
  const survivors = candidates.filter((c) => c.score >= threshold);
  const capped = capPerClaim(survivors, maxPerClaim);
  return finalizeOrder(capped);
}
