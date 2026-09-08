import type {
  BoundedReferenceReadResult,
  ReferenceCandidate,
  ReferenceSourceMetadataReader,
  ReferenceSourceReader,
} from "./reference-analysis-types/index.js";
import {
  DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES,
  DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES,
} from "./reference-analysis-limits.js";
import { readBoundedSource } from "./reference-read-bounded-source.js";
import {
  finishBoundedReferenceRead,
  newReferenceReadBudget,
  newReferenceReadCollections,
} from "./reference-read-support.js";

interface ReadBoundedReferenceSourcesInput {
  sources: readonly ReferenceCandidate[];
  readMetadata: ReferenceSourceMetadataReader;
  readSource: ReferenceSourceReader;
  maximumFileBytes?: number;
  maximumTotalBytes?: number;
}

function configuredLimits(input: ReadBoundedReferenceSourcesInput) {
  return {
    maximumFileBytes:
      input.maximumFileBytes ?? DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES,
    maximumTotalBytes:
      input.maximumTotalBytes ?? DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES,
  };
}

/** Reads sources below byte limits while preserving unavailable evidence. */
export function readBoundedReferenceSources(
  input: ReadBoundedReferenceSourcesInput,
): BoundedReferenceReadResult {
  const collections = newReferenceReadCollections();
  const budget = newReferenceReadBudget();
  const { maximumFileBytes, maximumTotalBytes } = configuredLimits(input);
  for (const source of input.sources) {
    readBoundedSource({
      source,
      readMetadata: input.readMetadata,
      readSource: input.readSource,
      maximumFileBytes,
      maximumTotalBytes,
      budget,
      collections,
    });
  }
  return finishBoundedReferenceRead({
    ...collections,
    acceptedBytes: budget.acceptedBytes,
  });
}
