import type {
  ReferenceCandidate,
  ReferenceSourceMetadataReader,
  ReferenceSourceReader,
} from "./reference-analysis-types/index.js";
import {
  addBinaryReferenceWarning,
  addUnreadableReferenceWarning,
} from "./reference-read-support.js";
import {
  metadataWithinLimits,
  totalLimitReached,
} from "./reference-read-bounded-limits.js";

function contentIsReadable(
  input: {
    collections: ReturnType<
      typeof import("./reference-read-support.js").newReferenceReadCollections
    >;
    source: ReferenceCandidate;
  },
  content: string,
): boolean {
  if (content.includes("\0")) {
    addBinaryReferenceWarning({ ...input.collections, source: input.source });
    return false;
  }
  return true;
}

export function readBoundedSource(input: {
  source: ReferenceCandidate;
  readMetadata: ReferenceSourceMetadataReader;
  readSource: ReferenceSourceReader;
  maximumFileBytes: number;
  maximumTotalBytes: number;
  budget: ReturnType<
    typeof import("./reference-read-support.js").newReferenceReadBudget
  >;
  collections: ReturnType<
    typeof import("./reference-read-support.js").newReferenceReadCollections
  >;
}): void {
  if (totalLimitReached(input)) return;
  try {
    const { byteLength } = input.readMetadata(input.source);
    if (!metadataWithinLimits(input, byteLength)) return;
    const content = input.readSource(input.source);
    if (!contentIsReadable(input, content)) return;
    input.collections.readableSources.push({ ...input.source, content });
    input.budget.acceptedBytes += byteLength;
  } catch {
    addUnreadableReferenceWarning({
      ...input.collections,
      source: input.source,
    });
  }
}
