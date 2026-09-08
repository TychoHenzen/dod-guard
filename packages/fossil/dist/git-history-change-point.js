import { resolveLogicalActivities } from "./git-history-identities.js";
const MIN_CHANGE_POINT_GAP_MS = 4 * 60 * 60 * 1_000;
const MAX_CHANGE_POINT_SIMILARITY = 0.1;
function fileIdentities(commits) {
    return resolveLogicalActivities(commits).identitiesByChange;
}
function commitFiles(commit, identities) {
    return new Set(commit.changes.map((change) => identities.get(change) ?? change.path));
}
export function partitionQualifies(commits, identities) {
    return commits.length >= 5 && new Set(commits.flatMap((commit) => [...commitFiles(commit, identities)])).size >= 3;
}
function weightedSimilarity(commits, cut, identities) {
    const touchedByCommit = commits.map((commit) => commitFiles(commit, identities));
    const touches = new Map();
    for (const files of touchedByCommit) {
        for (const file of files)
            touches.set(file, (touches.get(file) ?? 0) + 1);
    }
    const left = new Set(touchedByCommit.slice(cut - 5, cut).flatMap((files) => [...files]));
    const right = new Set(touchedByCommit.slice(cut, cut + 5).flatMap((files) => [...files]));
    const union = new Set([...left, ...right]);
    if (union.size === 0)
        return 1;
    const weightFor = (file) => Math.log((1 + commits.length) / (1 + (touches.get(file) ?? 0))) + 1;
    const intersectionWeight = [...left]
        .filter((file) => right.has(file))
        .reduce((total, file) => total + weightFor(file), 0);
    const unionWeight = [...union].reduce((total, file) => total + weightFor(file), 0);
    return intersectionWeight / unionWeight;
}
function selectChangePoint(commits, start, end, identities) {
    const candidates = [];
    for (let cut = start + 5; cut <= end - 5; cut += 1) {
        const left = commits.slice(start, cut);
        const right = commits.slice(cut, end);
        const gapMilliseconds = commits[cut].committerTimestampMs - commits[cut - 1].committerTimestampMs;
        if (gapMilliseconds < MIN_CHANGE_POINT_GAP_MS ||
            !partitionQualifies(left, identities) ||
            !partitionQualifies(right, identities))
            continue;
        const similarity = weightedSimilarity(commits, cut, identities);
        if (similarity <= MAX_CHANGE_POINT_SIMILARITY)
            candidates.push({ cut, gapMilliseconds, similarity });
    }
    return candidates.sort((left, right) => left.similarity - right.similarity || right.gapMilliseconds - left.gapMilliseconds || left.cut - right.cut)[0];
}
function splitChangePoints(commits, start, end, identities) {
    const candidate = selectChangePoint(commits, start, end, identities);
    if (!candidate)
        return [commits.slice(start, end)];
    return [
        ...splitChangePoints(commits, start, candidate.cut, identities),
        ...splitChangePoints(commits, candidate.cut, end, identities),
    ];
}
/** Splits qualifying close file-set changes in deterministic chronological order. */
export function splitAtChangePoint(commits) {
    if (commits.length === 0)
        return [];
    return splitChangePoints(commits, 0, commits.length, fileIdentities(commits));
}
//# sourceMappingURL=git-history-change-point.js.map