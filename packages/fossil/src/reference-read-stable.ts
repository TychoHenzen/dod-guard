import type { BoundedReferenceReadResult } from "./reference-analysis-types/bounded-reference-read-result.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { ReferenceSourceSnapshot } from "./reference-analysis-types/reference-source-snapshot.js";
import type { StableReferenceSourceBoundary } from "./reference-analysis-types/stable-reference-source-boundary.js";
import type { AnalysisWarning } from "./types.js";
import { DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES } from "./reference-analysis-limits.js";
import { finishBoundedReferenceRead, newReferenceReadBudget, newReferenceReadCollections } from "./reference-read-support.js";

/** Reads stable regular files after re-checking their identity, type, and canonical path. */
export function readStableReferenceSources(
  sources: readonly ReferenceCandidate[],
  boundary: StableReferenceSourceBoundary,
  maximumFileBytes = DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES,
  maximumTotalBytes = DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES,
): BoundedReferenceReadResult {
  const { readableSources, unavailablePaths, warnings } = newReferenceReadCollections();
  const budget = newReferenceReadBudget();
  const addWarning = (source: ReferenceCandidate, code: AnalysisWarning["code"], message: string) => {
    unavailablePaths.push(source.path);
    warnings.push({ code, message, path: source.path });
  };
  for (const source of sources) {
    if (budget.totalLimitReached || budget.acceptedBytes >= maximumTotalBytes) {
      addWarning(source, "reference_content_limit", "Reference source exceeds the total content limit.");
      continue;
    }
    let initial: ReferenceSourceSnapshot | undefined;
    try {
      initial = boundary.inspect(source);
    } catch {
      addWarning(source, "reference_unreadable", "Reference source could not be read.");
      continue;
    }
    if (!initial?.isRegularFile) {
      addWarning(source, "reference_unreadable", "Reference source could not be read.");
      continue;
    }
    if (initial.byteLength > maximumFileBytes) {
      addWarning(source, "reference_content_limit", "Reference source exceeds the per-file content limit.");
      continue;
    }
    if (budget.acceptedBytes + initial.byteLength > maximumTotalBytes) {
      addWarning(source, "reference_content_limit", "Reference source exceeds the total content limit.");
      budget.totalLimitReached = true;
      continue;
    }
    let current: ReferenceSourceSnapshot | undefined;
    try {
      current = boundary.inspect(source);
    } catch {
      addWarning(source, "reference_unreadable", "Reference source could not be read.");
      continue;
    }
    if (!current) {
      addWarning(source, "reference_unreadable", "Reference source could not be read.");
      continue;
    }
    if (
      current.identity !== initial.identity ||
      current.isRegularFile !== initial.isRegularFile ||
      current.byteLength !== initial.byteLength ||
      current.canonicalPath !== initial.canonicalPath
    ) {
      addWarning(source, "reference_path_changed", "Reference source changed during scanning.");
      continue;
    }
    try {
      const content = boundary.read(source);
      if (content.includes("\0")) {
        addWarning(source, "reference_binary", "Reference source is binary.");
        continue;
      }
      readableSources.push({ ...source, content });
      budget.acceptedBytes += initial.byteLength;
    } catch {
      addWarning(source, "reference_unreadable", "Reference source could not be read.");
    }
  }
  return finishBoundedReferenceRead({ readableSources, unavailablePaths, warnings, acceptedBytes: budget.acceptedBytes });
}
