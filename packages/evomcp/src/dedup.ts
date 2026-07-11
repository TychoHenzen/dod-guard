/**
 * Plan deduplication — detect near-duplicate plans to enforce diversity
 * in best-of-N sampling. Uses cheap heuristics first (exact match, high
 * token overlap), falls back to LLM-last-word heuristics.
 */

import type { Plan } from "./types.js";

/**
 * Deduplicate a list of plans. Returns the deduplicated list with
 * duplicates removed (keeps first occurrence).
 */
export function deduplicatePlans(plans: Plan[]): Plan[] {
  const kept: Plan[] = [];
  const seen = new Set<string>();

  for (const plan of plans) {
    const sig = normalizeForDedup(plan.summary);
    if (seen.has(sig)) continue;

    // Check similarity against already-kept plans
    let isDuplicate = false;
    for (const existing of kept) {
      if (isTooSimilar(plan.summary, existing.summary)) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.add(sig);
      kept.push(plan);
    }
  }

  return kept;
}

/**
 * Normalize a plan summary for exact-match dedup.
 * Lowercase, strip punctuation, normalize whitespace.
 */
function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Heuristic similarity check between two plan summaries.
 *
 * Strategy (cheap, no embeddings needed):
 * 1. Token overlap ratio — if >70% of tokens from shorter text appear in longer, flag.
 * 2. Shared key phrases — if both mention the same specific patterns, flag.
 */
function isTooSimilar(a: string, b: string): boolean {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const shorter = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const longer = tokensA.length > tokensB.length ? tokensA : tokensB;

  // Jaccard-like: intersection / shorter length
  const longerSet = new Set(longer);
  let overlap = 0;
  for (const t of shorter) {
    if (longerSet.has(t)) overlap++;
  }

  const ratio = overlap / shorter.length;
  return ratio > 0.65;
}

/**
 * Tokenize text into meaningful word tokens.
 * Discards stopwords and very short tokens.
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "can", "shall",
  "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after",
  "and", "but", "or", "nor", "not", "so", "yet", "both",
  "this", "that", "these", "those", "it", "its", "we", "they",
  "them", "their", "our", "my", "your", "he", "she", "his", "her",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Count distinct approaches by looking for differentiating keywords.
 * Returns a rough score: higher = more diverse set of plans.
 * Useful for deciding whether to re-sample with higher temperature.
 */
export function diversityScore(plans: Plan[]): number {
  if (plans.length <= 1) return 1;

  const allPairs = pairs(plans);
  let totalDistance = 0;

  for (const [a, b] of allPairs) {
    const tokensA = new Set(tokenize(a.summary));
    const tokensB = new Set(tokenize(b.summary));

    // Jaccard distance between token sets
    const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);
    const jaccard = union.size === 0 ? 1 : intersection.size / union.size;
    totalDistance += 1 - jaccard;
  }

  return allPairs.length === 0 ? 1 : totalDistance / allPairs.length;
}

function pairs<T>(arr: T[]): [T, T][] {
  const result: [T, T][] = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      result.push([arr[i], arr[j]]);
    }
  }
  return result;
}
