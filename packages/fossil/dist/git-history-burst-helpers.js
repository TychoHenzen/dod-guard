function identityForChange(change, identitiesByChange) {
    return identitiesByChange.get(change) ?? change.path;
}
function changeMatchesIdentity(commit, identity, identitiesByChange) {
    return commit.changes.some((change) => identityForChange(change, identitiesByChange) === identity);
}
export function commitsWithIdentity(commits, identity, identitiesByChange) {
    return new Set(commits.filter((commit) => changeMatchesIdentity(commit, identity, identitiesByChange)).map((commit) => commit.hash)).size;
}
export function changesByIdentity(commits, identitiesByChange) {
    const identities = new Map();
    for (const commit of commits) {
        for (const change of commit.changes) {
            const identity = identityForChange(change, identitiesByChange);
            const changes = identities.get(identity) ?? [];
            changes.push(change);
            identities.set(identity, changes);
        }
    }
    return identities;
}
export function filePath(activity, changes, identity) {
    if (activity) {
        if (activity.currentPath)
            return activity.currentPath;
        const previousPath = activity.paths.at(-1);
        if (previousPath)
            return previousPath;
    }
    const change = changes.at(-1);
    if (change)
        return change.path;
    return identity;
}
export function partitionCommits(partition, commitByHash) {
    return partition.map((commit) => commitByHash.get(commit.hash) ?? commit);
}
export function finalCommitIndex(commits, commitIndexByHash) {
    return Math.max(...commits.map((commit) => commitIndexByHash.get(commit.hash) ?? -1));
}
//# sourceMappingURL=git-history-burst-helpers.js.map