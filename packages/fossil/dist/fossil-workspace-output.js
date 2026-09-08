import { normalizedPath } from "./fossil-output-text.js";
function topLevelDirectory(path) {
    const normalized = normalizedPath(path);
    const separator = normalized.indexOf("/");
    return separator === -1 ? undefined : normalized.slice(0, separator);
}
/** Produces normal or verbose table rows without changing the underlying debris findings. */
export function workspaceDebrisTableRows(findings, mode) {
    if (mode === "verbose")
        return findings.map((finding) => ({ kind: "finding", finding }));
    const ignoredDirectoryCounts = new Map();
    for (const finding of findings) {
        const directory = finding.kind === "ignored" ? topLevelDirectory(finding.path) : undefined;
        if (directory)
            ignoredDirectoryCounts.set(directory, (ignoredDirectoryCounts.get(directory) ?? 0) + 1);
    }
    const summarizedDirectories = new Set([...ignoredDirectoryCounts].filter(([, count]) => count >= 20).map(([directory]) => directory));
    const emittedDirectories = new Set();
    const rows = [];
    for (const finding of findings) {
        const directory = finding.kind === "ignored" ? topLevelDirectory(finding.path) : undefined;
        if (!(directory && summarizedDirectories.has(directory))) {
            rows.push({ kind: "finding", finding });
            continue;
        }
        if (emittedDirectories.has(directory))
            continue;
        emittedDirectories.add(directory);
        rows.push({ kind: "ignored-directory-summary", directory, count: ignoredDirectoryCounts.get(directory) ?? 0 });
    }
    return rows;
}
//# sourceMappingURL=fossil-workspace-output.js.map