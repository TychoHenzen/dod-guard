import { resolveLogicalActivities } from "./git-history-identities.js";
import { partitionQualifies, splitAtChangePoint } from "./git-history-change-point.js";
/** Assembles qualified recursive partitions into deterministic closed burst activity. */
export function assembleClosedBursts(fullChronologicalHistory, closedTemporalClusters) {
    const resolution = resolveLogicalActivities(fullChronologicalHistory);
    const activitiesByIdentity = new Map(resolution.activities.map((activity) => [activity.identity, activity]));
    const commitByHash = new Map(fullChronologicalHistory.map((commit) => [commit.hash, commit]));
    const commitIndexByHash = new Map(fullChronologicalHistory.map((commit, index) => [commit.hash, index]));
    const finalPartitions = closedTemporalClusters
        .flatMap((cluster) => splitAtChangePoint(cluster))
        .filter((partition) => partitionQualifies(partition, resolution.identitiesByChange));
    return finalPartitions.map((partition) => {
        const commits = partition.map((commit) => commitByHash.get(commit.hash) ?? commit);
        const identities = new Map();
        for (const commit of commits) {
            for (const change of commit.changes) {
                const identity = resolution.identitiesByChange.get(change) ?? change.path;
                const changes = identities.get(identity) ?? [];
                changes.push(change);
                identities.set(identity, changes);
            }
        }
        const finalCommitIndex = Math.max(...commits.map((commit) => commitIndexByHash.get(commit.hash) ?? -1));
        const files = [...identities].map(([identity, changes]) => {
            const activity = activitiesByIdentity.get(identity);
            const postBurstCommits = new Set(fullChronologicalHistory
                .slice(finalCommitIndex + 1)
                .filter((commit) => commit.changes.some((change) => (resolution.identitiesByChange.get(change) ?? change.path) === identity))
                .map((commit) => commit.hash)).size;
            return {
                identity,
                path: activity?.currentPath ?? activity?.paths.at(-1) ?? changes.at(-1)?.path ?? identity,
                burstCommits: new Set(commits
                    .filter((commit) => commit.changes.some((change) => (resolution.identitiesByChange.get(change) ?? change.path) === identity))
                    .map((commit) => commit.hash)).size,
                postBurstCommits,
                createdInBurst: changes.some((change) => change.status === "added" || change.status === "copied"),
                existsAtHead: activity?.existsAtHead ?? true,
            };
        });
        const first = commits[0];
        const last = commits.at(-1);
        if (!(first && last))
            throw new Error("Cannot assemble an empty burst");
        return {
            id: `burst-${first.hash}-${last.hash}`,
            startTimestampMs: first.committerTimestampMs,
            endTimestampMs: last.committerTimestampMs,
            commits,
            files,
            closed: true,
        };
    });
}
//# sourceMappingURL=git-history-bursts.js.map