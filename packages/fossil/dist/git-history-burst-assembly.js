import { changesByIdentity, commitsWithIdentity, filePath, finalCommitIndex, partitionCommits, } from "./git-history-burst-helpers.js";
function burstFile(input) {
    const { identity, changes, commits, fullChronologicalHistory, finalIndex, activitiesByIdentity, resolution, } = input;
    const activity = activitiesByIdentity.get(identity);
    return {
        identity,
        path: filePath(activity, changes, identity),
        burstCommits: commitsWithIdentity(commits, identity, resolution.identitiesByChange),
        postBurstCommits: commitsWithIdentity(fullChronologicalHistory.slice(finalIndex + 1), identity, resolution.identitiesByChange),
        createdInBurst: changes.some((change) => change.status === "added" || change.status === "copied"),
        existsAtHead: activity?.existsAtHead ?? true,
    };
}
export function assembleBurst(input) {
    const commits = partitionCommits(input.partition, input.commitByHash);
    const identities = changesByIdentity(commits, input.resolution.identitiesByChange);
    const finalIndex = finalCommitIndex(commits, input.commitIndexByHash);
    const files = [...identities].map(([identity, changes]) => burstFile({
        identity,
        changes,
        commits,
        fullChronologicalHistory: input.fullChronologicalHistory,
        finalIndex,
        activitiesByIdentity: input.activitiesByIdentity,
        resolution: input.resolution,
    }));
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
}
//# sourceMappingURL=git-history-burst-assembly.js.map