import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { ReferenceSourceMetadataReader } from "./reference-analysis-types/reference-source-metadata-reader.js";
import type { ReferenceSourceReader } from "./reference-analysis-types/reference-source-reader.js";
import {
  addBinaryReferenceWarning,
  addReferenceWarning,
  addUnreadableReferenceWarning,
} from "./reference-read-support.js";
function contentLimit(input: {
  collections: ReturnType<typeof import("./reference-read-support.js").newReferenceReadCollections>;
  source: ReferenceCandidate;
  message: string;
}): void {
  addReferenceWarning({ ...input.collections, source: input.source, code: "reference_content_limit", message: input.message });
}

function totalLimitReached(input: {
  budget: ReturnType<typeof import("./reference-read-support.js").newReferenceReadBudget>;
  maximumTotalBytes: number;
  collections: ReturnType<typeof import("./reference-read-support.js").newReferenceReadCollections>;
  source: ReferenceCandidate;
}): boolean {
  if (input.budget.totalLimitReached || input.budget.acceptedBytes >= input.maximumTotalBytes) {
    contentLimit({
      collections: input.collections,
      source: input.source,
      message: "Reference source exceeds the total content limit.",
    });
    return true;
  }
  return false;
}

function metadataWithinLimits(
  input: {
    budget: ReturnType<typeof import("./reference-read-support.js").newReferenceReadBudget>;
    maximumFileBytes: number;
    maximumTotalBytes: number;
    collections: ReturnType<typeof import("./reference-read-support.js").newReferenceReadCollections>;
    source: ReferenceCandidate;
  },
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

function contentIsReadable(
  input: {
    collections: ReturnType<typeof import("./reference-read-support.js").newReferenceReadCollections>;
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
  budget: ReturnType<typeof import("./reference-read-support.js").newReferenceReadBudget>;
  collections: ReturnType<typeof import("./reference-read-support.js").newReferenceReadCollections>;
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
    addUnreadableReferenceWarning({ ...input.collections, source: input.source });
  }
}
