import { createHash } from "node:crypto";
import type { QualityConfig } from "./config.js";
import type { Snapshot } from "./snapshot.js";

export const DECISION_RECORD_PATH = ".github/quality/architecture-decisions.json";
const SOURCE_PATH = /\.(?:ts|tsx|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|cc|cpp|cxx|h|hpp)$/i;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Hashes every staged source input except the acknowledgement file itself. */
export function fingerprintSnapshot(snapshot: Snapshot, config: QualityConfig): string {
  const changes = snapshot.changes
    .filter((change) => change.before?.path !== DECISION_RECORD_PATH && change.after?.path !== DECISION_RECORD_PATH)
    .filter((change) => SOURCE_PATH.test(change.before?.path ?? "") || SOURCE_PATH.test(change.after?.path ?? ""))
    .map((change) => ({ kind: change.kind, before: change.before, after: change.after }))
    .sort((left, right) =>
      `${left.after?.path ?? left.before?.path}`.localeCompare(`${right.after?.path ?? right.before?.path}`),
    );
  return createHash("sha256")
    .update(canonical({ baseIdentity: snapshot.baseIdentity, changes, config }))
    .digest("hex");
}
