import type { ReferenceSourceSnapshot } from "./reference-analysis-types.js";
import type { StableReadInput } from "./reference-read-stable-types.js";
import { warnStableRead } from "./reference-read-stable-warn.js";

export function hasStableCapacity(input: StableReadInput): boolean {
  if (
    input.budget.totalLimitReached ||
    input.budget.acceptedBytes >= input.maximumTotalBytes
  ) {
    warnStableRead(
      input,
      "reference_content_limit",
      "Reference source exceeds the total content limit.",
    );
    return false;
  }
  return true;
}

export function inspectInitialSnapshot(
  input: StableReadInput,
): ReferenceSourceSnapshot | undefined {
  let initial: ReferenceSourceSnapshot | undefined;
  try {
    initial = input.boundary.inspect(input.source);
  } catch {
    warnStableRead(
      input,
      "reference_unreadable",
      "Reference source could not be read.",
    );
    return undefined;
  }
  if (!initial?.isRegularFile) {
    warnStableRead(
      input,
      "reference_unreadable",
      "Reference source could not be read.",
    );
    return undefined;
  }
  return initial;
}

export function initialWithinLimits(
  input: StableReadInput,
  initial: ReferenceSourceSnapshot,
): boolean {
  if (initial.byteLength > input.maximumFileBytes) {
    warnStableRead(
      input,
      "reference_content_limit",
      "Reference source exceeds the per-file content limit.",
    );
    return false;
  }
  if (
    input.budget.acceptedBytes + initial.byteLength >
    input.maximumTotalBytes
  ) {
    warnStableRead(
      input,
      "reference_content_limit",
      "Reference source exceeds the total content limit.",
    );
    input.budget.totalLimitReached = true;
    return false;
  }
  return true;
}

export { inspectCurrentSnapshot } from "./reference-read-stable-snapshots.js";
