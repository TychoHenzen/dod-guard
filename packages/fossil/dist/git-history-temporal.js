function startsNewCluster(current, commit, gapMilliseconds) {
    const previous = current?.at(-1);
    return (!(current && previous) ||
        commit.committerTimestampMs - previous.committerTimestampMs >
            gapMilliseconds);
}
/** Splits commits where an adjacent timestamp gap exceeds the limit. */
export function splitTemporalClusters(commits, gapMilliseconds) {
    if (gapMilliseconds < 0)
        throw new RangeError("gapMilliseconds must be nonnegative");
    const clusters = [];
    for (const commit of commits) {
        const current = clusters.at(-1);
        if (startsNewCluster(current, commit, gapMilliseconds)) {
            clusters.push([commit]);
            continue;
        }
        clusters.at(-1)?.push(commit);
    }
    return clusters;
}
//# sourceMappingURL=git-history-temporal.js.map