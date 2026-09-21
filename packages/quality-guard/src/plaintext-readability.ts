import {
  READABILITY_POLICY,
} from "./plaintext-readability-types.js";
import type { ReadabilityResult } from "./plaintext-readability-result.js";
import type { ReadabilityStatus } from "./plaintext-readability-status.js";
import type { TextstatProvider } from "./plaintext-provider-types.js";
import { prepareInput } from "./plaintext/input.js";
import { contextFor, longestSentence } from "./plaintext/normalization.js";
import { baseResult } from "./plaintext/results.js";
import {
  constraintFailuresFor,
  reasonFor,
  scoreMeasures,
} from "./plaintext/scoring.js";
import { runTextstat } from "./plaintext-textstat/index.js";
import type { TextstatMeasures } from "./plaintext-textstat-measures.js";
import type { TextstatResult } from "./plaintext-textstat-result.js";

function providerResult(
  text: string,
  provider: TextstatProvider,
): TextstatResult {
  try {
    return provider(text);
  } catch (error) {
    return {
      status: "unavailable",
      reason: `textstat provider failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function measuredResult(
  normalized: string,
  wordCount: number,
  measures: TextstatMeasures,
): ReadabilityResult {
  const score = scoreMeasures(measures);
  const longest = longestSentence(normalized);
  const constraintFailures = constraintFailuresFor(longest.count);
  const status: ReadabilityStatus =
    score >= READABILITY_POLICY.threshold && constraintFailures.length === 0
      ? "pass"
      : "fail";
  return baseResult({
    status,
    reason: reasonFor(status, score),
    wordCount,
    extra: {
      score,
      measures,
      constraintFailures,
      context:
        status === "fail" ? contextFor(longest.text || normalized) : undefined,
    },
  });
}

export function unavailableReadabilityResult(
  reason: string,
): ReadabilityResult {
  return baseResult({ status: "unavailable", reason, wordCount: 0 });
}

export function checkPlaintextReadability(
  text: string,
  provider: TextstatProvider = runTextstat,
): ReadabilityResult {
  const prepared = prepareInput(text);
  if (prepared.early) return prepared.early;
  const result = providerResult(prepared.normalized, provider);
  if (result.status === "unavailable")
    return baseResult({
      status: "unavailable",
      reason: result.reason,
      wordCount: prepared.wordCount,
    });
  return measuredResult(prepared.normalized, prepared.wordCount, result.measures);
}

export function readabilityExitCode(status: ReadabilityStatus): number {
  return status === "fail" ? 2 : 0;
}
