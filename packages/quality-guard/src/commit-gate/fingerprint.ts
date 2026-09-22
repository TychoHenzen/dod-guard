import { createHash } from "node:crypto";
import { canonical } from "./canonical.js";
import type { QualityConfig } from "./config.js";
import type { Snapshot } from "./snapshot.js";
import { sourceChanges } from "./source-snapshot.js";

export { DECISION_RECORD_PATH } from "./source-snapshot.js";

/** Hashes every staged source input except the acknowledgement file itself. */
export function fingerprintSnapshot(
  snapshot: Snapshot,
  config: QualityConfig,
): string {
  const changes = sourceChanges(snapshot.changes);
  return createHash("sha256")
    .update(
      canonical({
        baseIdentity: snapshot.baseIdentity,
        targetIdentity: snapshot.targetIdentity,
        changes,
        config,
      }),
    )
    .digest("hex");
}
