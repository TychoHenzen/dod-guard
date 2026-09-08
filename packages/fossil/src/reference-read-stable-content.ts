import { addBinaryReferenceWarning, addReferenceWarning } from "./reference-read-support.js";
import type { ReferenceSourceSnapshot } from "./reference-analysis-types/reference-source-snapshot.js";
import type { StableReadInput } from "./reference-read-stable-types.js";

export function readStableContent(input: StableReadInput, initial: ReferenceSourceSnapshot): void {
  try {
    const content = input.boundary.read(input.source);
    if (content.includes("\0")) {
      addBinaryReferenceWarning({ ...input.collections, source: input.source });
      return;
    }
    input.collections.readableSources.push({ ...input.source, content });
    input.budget.acceptedBytes += initial.byteLength;
  } catch {
    addReferenceWarning({
      ...input.collections,
      source: input.source,
      code: "reference_unreadable",
      message: "Reference source could not be read.",
    });
  }
}
