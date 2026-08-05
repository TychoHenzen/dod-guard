// Sentence-level matching helpers for the prose overlap gate. Two floors
// below serve different jobs: NEAR_DUPLICATE_FLOOR asks whether a rewrite
// sentence is close enough to count as the same claim in different words;
// ALIGNMENT_FLOOR asks only which original sentence a rewrite sentence
// pairs best with, so the `order` metric has evidence even when no
// sentence clears the near-duplicate bar.

import { proseTokens, sentences, jaccard } from "./prose-tokens.mjs";
import { removeTokenRuns } from "./text-tokens.mjs";
import { orderSimilarity } from "./metric-stats.mjs";

// Below this, two sentences are unrelated content, not a paraphrase of
// each other. Used by the `sentences` metric, where near-duplication is
// the claim being tested.
const NEAR_DUPLICATE_FLOOR = 0.6;
// The `order` metric only needs to know which original sentence a rewrite
// sentence pairs best with, not whether that pairing is a close paraphrase.
// A synonym-heavy passage can drop every sentence below the near-duplicate
// floor while its best-available pairings still walk the original in
// order, so order uses its own, looser floor. Set from measurement: see
// the comment above DEFAULT_THRESHOLDS in prose-metrics.mjs.
const ALIGNMENT_FLOOR = 0.35;
// A sentence shorter than this produces a noisy Jaccard score either way,
// so it never counts toward the sample.
const MIN_SENTENCE_TOKENS = 6;

function filteredTokens(sentence, settings) {
  const tokens = proseTokens(sentence, settings.whitelist);
  return removeTokenRuns(tokens, settings.contractRuns);
}

// Builds {index, tokens} records for every sentence in `text`, in document
// order. `requireMinimum` applies the length floor, which only the rewrite
// side needs: the original side is a lookup table, not a sample.
function recordsFor(text, settings, requireMinimum) {
  const records = [];
  sentences(text).forEach((sentence, index) => {
    const tokens = filteredTokens(sentence, settings);
    if (requireMinimum && tokens.length < MIN_SENTENCE_TOKENS) {
      return;
    }
    records.push({ index, tokens });
  });
  return records;
}

function bestMatch(tokens, originalRecords) {
  let best = { index: -1, similarity: 0 };
  for (const record of originalRecords) {
    const similarity = jaccard(tokens, record.tokens);
    if (similarity > best.similarity) {
      best = { index: record.index, similarity };
    }
  }
  return best;
}

// The sequence of original-sentence indexes each considered rewrite
// sentence best matches, in rewrite document order, keeping only matches
// at or above `floor`. A rewrite sentence with no match clearing the floor
// contributes nothing to the sequence.
function matchedIndexes(rewriteRecords, originalRecords, floor) {
  const indexes = [];
  for (const record of rewriteRecords) {
    const match = bestMatch(record.tokens, originalRecords);
    if (match.similarity >= floor) {
      indexes.push(match.index);
    }
  }
  return indexes;
}

export function sentenceStats(original, rewrite, settings) {
  const originalRecords = recordsFor(original, settings, false);
  const rewriteRecords = recordsFor(rewrite, settings, true);
  const matched = matchedIndexes(
    rewriteRecords, originalRecords, NEAR_DUPLICATE_FLOOR,
  );
  const rate =
    rewriteRecords.length === 0 ? 0 : matched.length / rewriteRecords.length;
  return { rate, sample: rewriteRecords.length };
}

// Compares the matched sequence against its own ascending sort, which is
// the original's own order. A rate near one means the rewrite walks the
// original's skeleton sentence by sentence. Uses ALIGNMENT_FLOOR, not
// NEAR_DUPLICATE_FLOOR: alignment only needs the best-available pairing,
// not a close paraphrase.
export function proseOrderStats(original, rewrite, settings) {
  const originalRecords = recordsFor(original, settings, false);
  const rewriteRecords = recordsFor(rewrite, settings, true);
  const sequence = matchedIndexes(
    rewriteRecords, originalRecords, ALIGNMENT_FLOOR,
  );
  const sorted = [...sequence].sort((left, right) => left - right);
  return { rate: orderSimilarity(sorted, sequence), sample: sequence.length };
}
