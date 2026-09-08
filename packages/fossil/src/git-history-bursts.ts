import type { Burst, GitCommit } from "./types.js";
import { resolveLogicalActivities } from "./git-history-identities.js";
import {
  partitionQualifies,
  splitAtChangePoint,
} from "./git-history-change-point.js";
import { assembleBurst } from "./git-history-burst-assembly.js";

/** Assembles qualified recursive partitions into closed burst activity. */
export function assembleClosedBursts(
  fullChronologicalHistory: readonly GitCommit[],
  closedTemporalClusters: readonly (readonly GitCommit[])[],
): Burst[] {
  const resolution = resolveLogicalActivities(fullChronologicalHistory);
  const activitiesByIdentity = new Map(
    resolution.activities.map((activity) => [activity.identity, activity]),
  );
  const commitByHash = new Map(
    fullChronologicalHistory.map((commit) => [commit.hash, commit]),
  );
  const commitIndexByHash = new Map(
    fullChronologicalHistory.map((commit, index) => [commit.hash, index]),
  );
  const finalPartitions = closedTemporalClusters
    .flatMap((cluster) => splitAtChangePoint(cluster))
    .filter((partition) =>
      partitionQualifies(partition, resolution.identitiesByChange),
    );
  return finalPartitions.map((partition) =>
    assembleBurst({
      partition,
      fullChronologicalHistory,
      activitiesByIdentity,
      resolution,
      commitByHash,
      commitIndexByHash,
    }),
  );
}
