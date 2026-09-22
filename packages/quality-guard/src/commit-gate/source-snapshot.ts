import { createHash } from "node:crypto";
import { canonical } from "./canonical.js";
import type { Snapshot } from "./snapshot-types.js";

export const DECISION_RECORD_PATH =
  ".github/quality/architecture-decisions.json";
const SOURCE_PATH =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|cc|cpp|cxx|h|hpp)$/i;

export function sourceSnapshotIdentity(changes: Snapshot["changes"]): string {
  return createHash("sha256")
    .update(canonical(sourceChanges(changes)))
    .digest("hex");
}

export function sourceChanges(changes: Snapshot["changes"]) {
  return changes
    .filter(isEligibleSourceChange)
    .map(fingerprintChange)
    .sort(compareChanges);
}

function isEligibleSourceChange(change: Snapshot["changes"][number]): boolean {
  return (
    change.before?.path !== DECISION_RECORD_PATH &&
    change.after?.path !== DECISION_RECORD_PATH &&
    (isSourceFile(change.before) || isSourceFile(change.after))
  );
}

function isSourceFile(
  file: { path: string; content: string } | undefined,
): boolean {
  return file !== undefined && SOURCE_PATH.test(file.path);
}

function fingerprintChange(change: Snapshot["changes"][number]) {
  return { kind: change.kind, before: change.before, after: change.after };
}

function compareChanges(
  left: Snapshot["changes"][number],
  right: Snapshot["changes"][number],
): number {
  const leftPath = left.after?.path ?? left.before?.path ?? "";
  const rightPath = right.after?.path ?? right.before?.path ?? "";
  return leftPath.localeCompare(rightPath);
}
