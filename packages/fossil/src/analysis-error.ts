import type { AnalysisErrorCode, AnalysisErrorDetails } from "./types.js";

/** A typed fatal result from repository analysis that callers can handle without parsing text. */
export class FossilAnalysisError extends Error {
  readonly code: AnalysisErrorCode;

  constructor({ code, message }: AnalysisErrorDetails) {
    super(message);
    this.code = code;
  }
}
