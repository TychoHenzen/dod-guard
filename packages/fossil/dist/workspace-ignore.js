import { normalizeWorkspacePath } from "./workspace-path-rules.js";
export { oldIgnoredWorkspaceCandidates, } from "./workspace-ignore-candidates.js";
function isAbsoluteWorkspacePath(path) {
    return path.startsWith("/") || /^[A-Za-z]:\//.test(path);
}
function isLocalExclude(path) {
    if (path === ".git/info/exclude")
        return true;
    return path.endsWith("/.git/info/exclude");
}
function classifyIgnoreSource(sourcePath, globalExcludePath) {
    const normalizedSource = normalizeWorkspacePath(sourcePath);
    if (isLocalExclude(normalizedSource))
        return "local-exclude";
    if (globalExcludePath) {
        if (normalizeWorkspacePath(globalExcludePath) === normalizedSource)
            return "global-exclude";
    }
    if (!isAbsoluteWorkspacePath(normalizedSource))
        return "repository";
    return "unknown";
}
function provenanceEntry(fields, index, globalExcludePath) {
    const sourcePath = fields[index];
    const rule = fields[index + 2];
    const path = fields[index + 3];
    if (!sourcePath)
        return undefined;
    if (rule === undefined)
        return undefined;
    if (path === undefined)
        return undefined;
    return {
        path,
        rule,
        source: classifyIgnoreSource(sourcePath, globalExcludePath),
    };
}
/** Parses NUL-delimited source, line, rule, and path records. */
export function parseVerboseCheckIgnore(output, globalExcludePath) {
    const fields = output.split("\0");
    if (fields.at(-1) === "")
        fields.pop();
    const provenance = [];
    for (let index = 0; index + 3 < fields.length; index += 4) {
        const entry = provenanceEntry(fields, index, globalExcludePath);
        if (entry)
            provenance.push(entry);
    }
    return provenance;
}
/** Selects old regular untracked files for later evidence checks. */
export function oldUntrackedWorkspaceCandidates(files, analysisTimestampMs, minimumAgeDays) {
    const cutoffTimestampMs = analysisTimestampMs - minimumAgeDays * 24 * 60 * 60 * 1_000;
    return files
        .filter((file) => file.isRegularFile && file.modifiedTimestampMs <= cutoffTimestampMs)
        .map(({ path, modifiedTimestampMs }) => ({
        path,
        kind: "untracked",
        modifiedTimestampMs,
    }));
}
//# sourceMappingURL=workspace-ignore.js.map