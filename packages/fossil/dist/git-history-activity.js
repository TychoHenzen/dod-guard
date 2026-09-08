export function activityForState(state) {
    const timestamps = state.events.map(({ commit }) => commit.committerTimestampMs);
    return {
        identity: state.identity,
        currentPath: state.currentPath,
        paths: state.paths,
        firstCommitTimestampMs: Math.min(...timestamps),
        lastCommitTimestampMs: Math.max(...timestamps),
        commitCount: new Set(state.events.map(({ commit }) => commit.hash)).size,
        created: state.events.some(({ change }) => change.status === "added" || change.status === "copied"),
        deleted: state.currentPath === undefined,
        existsAtHead: state.currentPath !== undefined,
    };
}
//# sourceMappingURL=git-history-activity.js.map