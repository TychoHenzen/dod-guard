import { assertIncludedCommitLimit } from "./git-history-contract.js";
import { resolveLogicalActivities } from "./git-history-identities.js";
function pathExtension(path) {
    const filename = path.slice(path.lastIndexOf("/") + 1);
    const dot = filename.lastIndexOf(".");
    return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}
/** Normalizes extension options while preserving deterministic first-occurrence order. */
export function normalizeExtensions(values) {
    const normalized = new Set();
    for (const value of values)
        normalized.add(`.${value.replace(/^\./, "").toLowerCase()}`);
    return [...normalized];
}
/** Keeps whole candidate identities for later burst and score calculations. */
export function filterHistoryByExtensions(commits, extensions) {
    if (extensions.size === 0) {
        const included = [...commits];
        assertIncludedCommitLimit(included.length);
        return included;
    }
    const resolution = resolveLogicalActivities(commits);
    const selectedIdentities = new Set(resolution.activities
        .filter((activity) => extensions.has(pathExtension(activity.currentPath ?? activity.paths.at(-1) ?? "")))
        .map((activity) => activity.identity));
    const included = commits.flatMap((commit) => {
        const changes = commit.changes.filter((change) => selectedIdentities.has(resolution.identitiesByChange.get(change) ?? ""));
        return changes.length === 0 ? [] : [{ ...commit, changes }];
    });
    assertIncludedCommitLimit(included.length);
    return included;
}
//# sourceMappingURL=git-history-extensions.js.map