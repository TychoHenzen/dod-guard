import type { ReadabilityStatus } from "./plaintext-readability-status.js";
import { READABILITY_POLICY } from "./plaintext-readability-types.js";
import type { TextstatMeasures } from "./plaintext-textstat-measures.js";

export type ReadabilityResult = {
  status: ReadabilityStatus;
  reason: string;
  message: string;
  wordCount: number;
  score?: number;
  threshold: number;
  measures?: TextstatMeasures;
  constraintFailures: string[];
  context?: string;
  policy: typeof READABILITY_POLICY;
};
