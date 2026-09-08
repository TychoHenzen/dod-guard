import type {
  ReferenceCandidate,
} from "./reference-analysis-types/reference-candidate.js";
import {
  addReferenceWarning,
  newReferenceReadBudget,
  newReferenceReadCollections,
} from "./reference-read-support.js";

type ReferenceReadLimitsInput = {
  budget: ReturnType<typeof newReferenceReadBudget>;
  maximumTotalBytes: number;
  maximumFileBytes: number;
  collections: ReturnType<typeof newReferenceReadCollections>;
  source: ReferenceCandidate;
};

function contentLimit(
  input: Pick<ReferenceReadLimitsInput, "collections" | "source"> & {
    message: string;
  },
): void {
  addReferenceWarning({
    ...input.collections,
    source: input.source,
    code: "reference_content_limit",
    message: input.message,
  });
}

export function totalLimitReached(
  input: Omit<ReferenceReadLimitsInput, "maximumFileBytes">,
): boolean {
  if (
    input.budget.totalLimitReached ||
    input.budget.acceptedBytes >= input.maximumTotalBytes
  ) {
    contentLimit({
      collections: input.collections,
      source: input.source,
      message: "Reference source exceeds the total content limit.",
    });
    return true;
  }
  return false;
}

export function metadataWithinLimits(
  input: ReferenceReadLimitsInput,
  byteLength: number,
): boolean {
  if (byteLength > input.maximumFileBytes) {
    contentLimit({
      collections: input.collections,
      source: input.source,
      message: "Reference source exceeds the per-file content limit.",
    });
    return false;
  }
  if (input.budget.acceptedBytes + byteLength > input.maximumTotalBytes) {
    contentLimit({
      collections: input.collections,
      source: input.source,
      message: "Reference source exceeds the total content limit.",
    });
    input.budget.totalLimitReached = true;
    return false;
  }
  return true;
}
