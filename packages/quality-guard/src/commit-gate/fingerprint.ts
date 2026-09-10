import { createHash } from "node:crypto";
import type { QualityConfig } from "./config.js";
import type { Snapshot } from "./snapshot.js";
import { canonical } from "./canonical.js";

export const DECISION_RECORD_PATH =
  ".github/quality/architecture-decisions.json";
const SOURCE_PATH =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|cc|cpp|cxx|h|hpp)$/i;

/** Hashes every staged source input except the acknowledgement file itself. */
export function fingerprintSnapshot(
  snapshot: Snapshot,
  config: QualityConfig,
): string {
  const changes = snapshot.changes
    .filter(isDecisionChange)
    .filter(isSourceChange)
    .map(fingerprintChange)
    .sort(compareChanges);
  return createHash("sha256")
    .update(canonical({ baseIdentity: snapshot.baseIdentity, changes, config }))
    .digest("hex");
}

function isDecisionChange(change: Snapshot["changes"][number]): boolean {
  return (
    change.before?.path !== DECISION_RECORD_PATH &&
    change.after?.path !== DECISION_RECORD_PATH
  );
}

function isSourceChange(change: Snapshot["changes"][number]): boolean {
  return isSourceFile(change.before) || isSourceFile(change.after);
}

function isSourceFile(
  file: { path: string; content: string } | undefined,
): boolean {
  return file !== undefined && SOURCE_PATH.test(file.path);
}

function fingerprintChange(change: Snapshot["changes"][number]) {
  return { kind: change.kind, before: change.before, after: change.after };
}

function changePath(change: Snapshot["changes"][number]): string {
  return change.after?.path ?? change.before?.path ?? "";
}

function compareChanges(
  left: Snapshot["changes"][number],
  right: Snapshot["changes"][number],
): number {
  return changePath(left).localeCompare(changePath(right));
}
