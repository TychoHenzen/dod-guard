import type { AnalysisWarning } from "./types.js";
import { addReferenceWarning } from "./reference-read-support.js";
import type { StableReadInput } from "./reference-read-stable-types.js";

export function warnStableRead(
  input: StableReadInput,
  code: AnalysisWarning["code"],
  message: string,
): void {
  addReferenceWarning({
    ...input.collections,
    source: input.source,
    code,
    message,
  });
}
