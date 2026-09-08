import type {
  ReferenceSourceSnapshot,
} from "./reference-analysis-types/reference-source-snapshot.js";
import type { StableReadInput } from "./reference-read-stable-types.js";
import { warnStableRead } from "./reference-read-stable-warn.js";

function sameSnapshot(
  initial: ReferenceSourceSnapshot,
  current: ReferenceSourceSnapshot,
): boolean {
  if (current.identity !== initial.identity) return false;
  if (current.isRegularFile !== initial.isRegularFile) return false;
  if (current.byteLength !== initial.byteLength) return false;
  if (current.canonicalPath !== initial.canonicalPath) return false;
  return true;
}

function unreadableSnapshot(input: StableReadInput): undefined {
  warnStableRead(
    input,
    "reference_unreadable",
    "Reference source could not be read.",
  );
  return undefined;
}

export function inspectCurrentSnapshot(
  input: StableReadInput,
  initial: ReferenceSourceSnapshot,
): ReferenceSourceSnapshot | undefined {
  let current: ReferenceSourceSnapshot | undefined;
  try {
    current = input.boundary.inspect(input.source);
  } catch {
    return unreadableSnapshot(input);
  }
  if (!current) return unreadableSnapshot(input);
  if (!sameSnapshot(initial, current)) {
    warnStableRead(
      input,
      "reference_path_changed",
      "Reference source changed during scanning.",
    );
    return undefined;
  }
  return current;
}
