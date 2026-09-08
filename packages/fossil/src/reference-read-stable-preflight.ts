import type { AnalysisWarning } from "./types.js";
import type { ReferenceSourceSnapshot } from "./reference-analysis-types/reference-source-snapshot.js";
import { addReferenceWarning } from "./reference-read-support.js";
import type { StableReadInput } from "./reference-read-stable-types.js";

function warn(input: StableReadInput, code: AnalysisWarning["code"], message: string): void {
  addReferenceWarning({ ...input.collections, source: input.source, code, message });
}

export function hasStableCapacity(input: StableReadInput): boolean {
  if (input.budget.totalLimitReached || input.budget.acceptedBytes >= input.maximumTotalBytes) {
    warn(input, "reference_content_limit", "Reference source exceeds the total content limit.");
    return false;
  }
  return true;
}

export function inspectInitialSnapshot(input: StableReadInput): ReferenceSourceSnapshot | undefined {
  let initial: ReferenceSourceSnapshot | undefined;
  try {
    initial = input.boundary.inspect(input.source);
  } catch {
    warn(input, "reference_unreadable", "Reference source could not be read.");
    return undefined;
  }
  if (!initial?.isRegularFile) {
    warn(input, "reference_unreadable", "Reference source could not be read.");
    return undefined;
  }
  return initial;
}

export function initialWithinLimits(input: StableReadInput, initial: ReferenceSourceSnapshot): boolean {
  if (initial.byteLength > input.maximumFileBytes) {
    warn(input, "reference_content_limit", "Reference source exceeds the per-file content limit.");
    return false;
  }
  if (input.budget.acceptedBytes + initial.byteLength > input.maximumTotalBytes) {
    warn(input, "reference_content_limit", "Reference source exceeds the total content limit.");
    input.budget.totalLimitReached = true;
    return false;
  }
  return true;
}

function sameSnapshot(initial: ReferenceSourceSnapshot, current: ReferenceSourceSnapshot): boolean {
  if (current.identity !== initial.identity) return false;
  if (current.isRegularFile !== initial.isRegularFile) return false;
  if (current.byteLength !== initial.byteLength) return false;
  if (current.canonicalPath !== initial.canonicalPath) return false;
  return true;
}

export function inspectCurrentSnapshot(
  input: StableReadInput,
  initial: ReferenceSourceSnapshot,
): ReferenceSourceSnapshot | undefined {
  let current: ReferenceSourceSnapshot | undefined;
  try {
    current = input.boundary.inspect(input.source);
  } catch {
    warn(input, "reference_unreadable", "Reference source could not be read.");
    return undefined;
  }
  if (!current) {
    warn(input, "reference_unreadable", "Reference source could not be read.");
    return undefined;
  }
  if (!sameSnapshot(initial, current)) {
    warn(input, "reference_path_changed", "Reference source changed during scanning.");
    return undefined;
  }
  return current;
}
