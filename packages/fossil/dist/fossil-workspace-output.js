import { normalizedPath } from "./fossil-output-text.js";
function topLevelDirectory(path) {
    const normalized = normalizedPath(path);
    const separator = normalized.indexOf("/");
    return separator === -1 ? undefined : normalized.slice(0, separator);
}
function findingDirectory(finding) {
    if (finding.kind !== "ignored")
        return undefined;
    return topLevelDirectory(finding.path);
}
function ignoredDirectoryCounts(findings) {
    const counts = new Map();
    for (const finding of findings) {
        const directory = findingDirectory(finding);
        if (directory)
            counts.set(directory, (counts.get(directory) ?? 0) + 1);
    }
    return counts;
}
function addWorkspaceRow({ rows, finding, summarizedDirectories, emittedDirectories, directoryCounts }) {
    const directory = findingDirectory(finding);
    if (!isSummarized(directory, summarizedDirectories)) {
        rows.push({ kind: "finding", finding });
        return;
    }
    if (emittedDirectories.has(directory))
        return;
    emittedDirectories.add(directory);
    rows.push({ kind: "ignored-directory-summary", directory, count: directoryCounts.get(directory) ?? 0 });
}
function isSummarized(directory, summarizedDirectories) {
    return directory !== undefined && summarizedDirectories.has(directory);
}
/** Produces normal or verbose table rows without changing the underlying debris findings. */
export function workspaceDebrisTableRows(findings, mode) {
    if (mode === "verbose")
        return findings.map((finding) => ({ kind: "finding", finding }));
    const directoryCounts = ignoredDirectoryCounts(findings);
    const summarizedDirectories = new Set([...directoryCounts].filter(([, count]) => count >= 20).map(([directory]) => directory));
    const emittedDirectories = new Set();
    const rows = [];
    for (const finding of findings)
        addWorkspaceRow({ rows, finding, summarizedDirectories, emittedDirectories, directoryCounts });
    return rows;
}
//# sourceMappingURL=fossil-workspace-output.js.map