import type { ReadabilityStatus } from "../plaintext-readability-status.js";
import { READABILITY_POLICY } from "../plaintext-readability-types.js";
import type { TextstatMeasures } from "../plaintext-textstat-measures.js";

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreMeasures(measures: TextstatMeasures): number {
  const easeScore = clamp(
    (measures.fleschReadingEase /
      READABILITY_POLICY.targets.fleschReadingEase) *
      100,
  );
  const gradeScore = clamp(
    ((12 - measures.fleschKincaidGrade) /
      (12 - READABILITY_POLICY.targets.fleschKincaidGrade)) *
      100,
  );
  return rounded(
    easeScore * READABILITY_POLICY.weights.fleschReadingEase +
      gradeScore * READABILITY_POLICY.weights.fleschKincaidGrade,
  );
}

export function constraintFailuresFor(longestSentence: number): string[] {
  if (longestSentence <= READABILITY_POLICY.maximumSentenceWords) return [];
  return [
    `a sentence has ${longestSentence} words, over the ${READABILITY_POLICY.maximumSentenceWords}-word limit`,
  ];
}

export function reasonFor(status: ReadabilityStatus, score: number): string {
  if (status === "pass")
    return "combined score and sentence-length policy passed";
  if (score < READABILITY_POLICY.threshold)
    return "combined score is below the threshold";
  return "dyslexia-friendly sentence-length policy failed";
}
