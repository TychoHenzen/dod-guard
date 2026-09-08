import type { BoundedReferenceReadResult } from "./reference-analysis-types/bounded-reference-read-result.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { ReferenceSourceMetadataReader } from "./reference-analysis-types/reference-source-metadata-reader.js";
import type { ReferenceSourceReader } from "./reference-analysis-types/reference-source-reader.js";
import { DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES } from "./reference-analysis-limits.js";
import { addUnreadableReferenceWarning, finishBoundedReferenceRead, newReferenceReadBudget, newReferenceReadCollections } from "./reference-read-support.js";

/** Reads sources below a per-file byte limit while preserving unavailable reference evidence for skipped files. */
export function readBoundedReferenceSources(
  sources: readonly ReferenceCandidate[],
  readMetadata: ReferenceSourceMetadataReader,
  readSource: ReferenceSourceReader,
  maximumFileBytes = DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES,
  maximumTotalBytes = DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES,
): BoundedReferenceReadResult {
  const { readableSources, unavailablePaths, warnings } = newReferenceReadCollections();
  const budget = newReferenceReadBudget();
  for (const source of sources) {
    if (budget.totalLimitReached || budget.acceptedBytes >= maximumTotalBytes) {
      unavailablePaths.push(source.path);
      warnings.push({
        code: "reference_content_limit",
        message: "Reference source exceeds the total content limit.",
        path: source.path,
      });
      continue;
    }
    try {
      const { byteLength } = readMetadata(source);
      if (byteLength > maximumFileBytes) {
        unavailablePaths.push(source.path);
        warnings.push({
          code: "reference_content_limit",
          message: "Reference source exceeds the per-file content limit.",
          path: source.path,
        });
        continue;
      }
      if (budget.acceptedBytes + byteLength > maximumTotalBytes) {
        unavailablePaths.push(source.path);
        warnings.push({
          code: "reference_content_limit",
          message: "Reference source exceeds the total content limit.",
          path: source.path,
        });
        budget.totalLimitReached = true;
        continue;
      }
      const content = readSource(source);
      if (content.includes("\0")) {
        unavailablePaths.push(source.path);
        warnings.push({ code: "reference_binary", message: "Reference source is binary.", path: source.path });
        continue;
      }
      readableSources.push({ ...source, content });
      budget.acceptedBytes += byteLength;
    } catch {
      addUnreadableReferenceWarning({ unavailablePaths, warnings, source });
    }
  }
  return finishBoundedReferenceRead({ readableSources, unavailablePaths, warnings, acceptedBytes: budget.acceptedBytes });
}
