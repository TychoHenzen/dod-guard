import type { ReadabilityResult } from "../plaintext-readability-result.js";
import type { ReadabilityStatus } from "../plaintext-readability-status.js";
import { READABILITY_POLICY } from "../plaintext-readability-types.js";
import type { TextstatMeasures } from "../plaintext-textstat-measures.js";

function failureValues(
  measures: TextstatMeasures | undefined,
  score: number | undefined,
): string {
  return measures
    ? `Flesch Reading Ease ${measures.fleschReadingEase}; ` +
        `Flesch-Kincaid Grade ${measures.fleschKincaidGrade}; ` +
        `combined score ${score}; threshold ${READABILITY_POLICY.threshold}.`
    : "No readability measures were available.";
}

function failureConstraints(constraintFailures: string[] | undefined): string {
  return constraintFailures?.length
    ? ` Constraints failed: ${constraintFailures.join("; ")}.`
    : "";
}

function messageFor(input: {
  status: ReadabilityStatus;
  reason: string;
  measures?: TextstatMeasures;
  score?: number;
  constraintFailures?: string[];
  context?: string;
}): string {
  if (input.status !== "fail")
    return `Readability check ${input.status}: ${input.reason}.`;
  return `Readability check failed. ${failureValues(input.measures, input.score)}${failureConstraints(input.constraintFailures)} Context: ${JSON.stringify(input.context ?? "")}`;
}

export function baseResult(input: {
  status: ReadabilityStatus;
  reason: string;
  wordCount: number;
  extra?: Partial<ReadabilityResult>;
}): ReadabilityResult {
  const extra = input.extra ?? {};
  return {
    status: input.status,
    reason: input.reason,
    message: messageFor({
      status: input.status,
      reason: input.reason,
      measures: extra.measures,
      score: extra.score,
      constraintFailures: extra.constraintFailures,
      context: extra.context,
    }),
    wordCount: input.wordCount,
    threshold: READABILITY_POLICY.threshold,
    constraintFailures: [],
    policy: READABILITY_POLICY,
    ...extra,
  };
}
