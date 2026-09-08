import type { ReferenceReadResult } from "./reference-read-result.js";

export interface BoundedReferenceReadResult extends ReferenceReadResult {
  readonly acceptedBytes: number;
}
