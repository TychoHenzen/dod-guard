import { resolveLogicalActivities } from "./git-history-identities.js";
import { partitionQualifies } from "./git-history-change-point.js";
/** Retains only clusters whose closed state was established by the caller. */
export function retainQualifiedClosedClusters(clusters) {
    const identities = resolveLogicalActivities(clusters.flat()).identitiesByChange;
    return clusters.filter((cluster) => partitionQualifies(cluster, identities)).map((cluster) => [...cluster]);
}
/** Retains temporal clusters that have remained inactive for the full configured gap. */
export function retainClosedTemporalClusters(clusters, analysisTimestampMs, gapMilliseconds) {
    if (gapMilliseconds < 0)
        throw new RangeError("gapMilliseconds must be nonnegative");
    return clusters
        .filter((cluster) => {
        const newest = cluster.at(-1);
        return (newest !== undefined &&
            !cluster.some((commit) => commit.committerTimestampMs > analysisTimestampMs) &&
            analysisTimestampMs - newest.committerTimestampMs >= gapMilliseconds);
    })
        .map((cluster) => [...cluster]);
}
//# sourceMappingURL=git-history-closure.js.map