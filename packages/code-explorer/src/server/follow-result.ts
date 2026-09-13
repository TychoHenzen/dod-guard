import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import { createEnvelope } from "./envelope.js";
import type { FollowCandidate } from "./relation-candidate.js";

export function createFollowEnvelope(
  relation: string,
  candidates: FollowCandidate[],
  freshness: FreshnessStatus,
): ReturnType<typeof createEnvelope> {
  if (relation === "definition") {
    const local = candidates.find((candidate) => candidate.external === false);
    if (local)
      return createEnvelope(freshness, "ready", {
        focus: local,
        source_location: local.range,
      });
  }
  return createEnvelope(freshness, "ready", { relation, candidates });
}
