import { READABILITY_POLICY } from "./plaintext-readability-types.js";
import type { ReadabilityResult } from "./plaintext-readability-result.js";
import { baseResult } from "./plaintext-results.js";
import {
  hasUnsupportedScript,
  normalizePlaintext,
  wordsIn,
} from "./plaintext-normalization.js";

export function prepareInput(text: string): {
  normalized: string;
  wordCount: number;
  early?: ReadabilityResult;
} {
  const normalized = normalizePlaintext(text);
  const wordCount = wordsIn(normalized).length;
  if (wordCount === 0)
    return {
      normalized,
      wordCount,
      early: baseResult({
        status: "skipped",
        reason: "input is empty after normalization",
        wordCount: 0,
      }),
    };
  if (hasUnsupportedScript(normalized))
    return {
      normalized,
      wordCount,
      early: baseResult({
        status: "unavailable",
        reason: "input uses a language script outside the supported Latin policy",
        wordCount,
      }),
    };
  if (wordCount < READABILITY_POLICY.minimumWords)
    return {
      normalized,
      wordCount,
      early: baseResult({
        status: "skipped",
        reason: `input has ${wordCount} words and needs at least ${READABILITY_POLICY.minimumWords}`,
        wordCount,
      }),
    };
  return { normalized, wordCount };
}
