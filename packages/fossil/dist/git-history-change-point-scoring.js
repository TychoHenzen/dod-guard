import { resolveLogicalActivities } from "./git-history-identities.js";
export function fileIdentities(commits) {
    return resolveLogicalActivities(commits).identitiesByChange;
}
function commitFiles(commit, identities) {
    return new Set(commit.changes.map((change) => identities.get(change) ?? change.path));
}
export function partitionQualifies(commits, identities) {
    return commits.length >= 5 && new Set(commits.flatMap((commit) => [...commitFiles(commit, identities)])).size >= 3;
}
function fileTouchCounts(touchedByCommit) {
    const touches = new Map();
    for (const files of touchedByCommit) {
        for (const file of files)
            touches.set(file, (touches.get(file) ?? 0) + 1);
    }
    return touches;
}
function windowFiles(touchedByCommit, start, end) {
    return new Set(touchedByCommit.slice(start, end).flatMap((files) => [...files]));
}
function weightedFiles(files, touches, commitCount) {
    return [...files].reduce((total, file) => total + Math.log((1 + commitCount) / (1 + (touches.get(file) ?? 0))) + 1, 0);
}
export function weightedSimilarity(commits, cut, identities) {
    const touchedByCommit = commits.map((commit) => commitFiles(commit, identities));
    const touches = fileTouchCounts(touchedByCommit);
    const left = windowFiles(touchedByCommit, cut - 5, cut);
    const right = windowFiles(touchedByCommit, cut, cut + 5);
    const union = new Set([...left, ...right]);
    if (union.size === 0)
        return 1;
    const intersection = [...left].filter((file) => right.has(file));
    const intersectionWeight = weightedFiles(intersection, touches, commits.length);
    const unionWeight = weightedFiles(union, touches, commits.length);
    return intersectionWeight / unionWeight;
}
//# sourceMappingURL=git-history-change-point-scoring.js.map