import { normalizeWorkspacePath } from "./workspace-path-rules.js";
function classifyIgnoreSource(sourcePath, globalExcludePath) {
    const normalizedSource = normalizeWorkspacePath(sourcePath);
    if (normalizedSource === ".git/info/exclude" || normalizedSource.endsWith("/.git/info/exclude"))
        return "local-exclude";
    if (globalExcludePath && normalizeWorkspacePath(globalExcludePath) === normalizedSource)
        return "global-exclude";
    if (!(normalizedSource.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSource)))
        return "repository";
    return "unknown";
}
/** Parses NUL-delimited source, line, rule, and path records from verbose Git ignore output. */
export function parseVerboseCheckIgnore(output, globalExcludePath) {
    const fields = output.split("\0");
    if (fields.at(-1) === "")
        fields.pop();
    const provenance = [];
    for (let index = 0; index + 3 < fields.length; index += 4) {
        const sourcePath = fields[index];
        const rule = fields[index + 2];
        const path = fields[index + 3];
        if (!(sourcePath && rule !== undefined && path !== undefined))
            continue;
        provenance.push({ path, rule, source: classifyIgnoreSource(sourcePath, globalExcludePath) });
    }
    return provenance;
}
/** Selects old regular untracked files before later ignore and usage-evidence checks. */
export function oldUntrackedWorkspaceCandidates(files, analysisTimestampMs, minimumAgeDays) {
    const cutoffTimestampMs = analysisTimestampMs - minimumAgeDays * 24 * 60 * 60 * 1_000;
    return files
        .filter((file) => file.isRegularFile && file.modifiedTimestampMs <= cutoffTimestampMs)
        .map(({ path, modifiedTimestampMs }) => ({ path, kind: "untracked", modifiedTimestampMs }));
}
/** Selects old regular ignored files and preserves their matching Git ignore rule provenance. */
export function oldIgnoredWorkspaceCandidates(files, provenance, analysisTimestampMs, minimumAgeDays) {
    const provenanceByPath = new Map(provenance.map((entry) => [entry.path, entry]));
    const cutoffTimestampMs = analysisTimestampMs - minimumAgeDays * 24 * 60 * 60 * 1_000;
    return files.flatMap((file) => {
        const ignore = provenanceByPath.get(file.path);
        if (!(file.isRegularFile && file.modifiedTimestampMs <= cutoffTimestampMs && ignore))
            return [];
        return [
            {
                path: file.path,
                kind: "ignored",
                modifiedTimestampMs: file.modifiedTimestampMs,
                ignore: { rule: ignore.rule, source: ignore.source },
            },
        ];
    });
}
//# sourceMappingURL=workspace-ignore.js.map