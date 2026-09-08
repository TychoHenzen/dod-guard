import type { AnalysisErrorCode } from "./analysis-error-code.js";

export interface AnalysisErrorDetails {
  readonly code: AnalysisErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}
