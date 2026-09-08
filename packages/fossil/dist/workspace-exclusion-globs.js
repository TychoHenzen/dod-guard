import { normalizeWorkspacePath } from "./workspace-path-rules.js";
import { callerGlobMatches } from "./workspace-exclusion-matcher.js";
const MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH = 256;
const MAXIMUM_CALLER_EXCLUSION_GLOBS = 64;
const MAXIMUM_CALLER_EXCLUSION_GLOB_BYTES = 4_096;
function withinCallerLimits(normalized, acceptedCount, byteLength) {
    if (acceptedCount >= MAXIMUM_CALLER_EXCLUSION_GLOBS)
        return false;
    if (normalized.length === 0)
        return false;
    if (normalized.length > MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH)
        return false;
    if (byteLength + normalized.length > MAXIMUM_CALLER_EXCLUSION_GLOB_BYTES)
        return false;
    return true;
}
function isRepositoryRelativePattern(normalized) {
    if (normalized.includes("\0"))
        return false;
    if (normalized.startsWith("/"))
        return false;
    return !normalized.split("/").includes("..");
}
function acceptedCallerPattern(pattern, acceptedCount, byteLength) {
    const normalized = normalizeWorkspacePath(pattern);
    if (!withinCallerLimits(normalized, acceptedCount, byteLength))
        return undefined;
    if (!isRepositoryRelativePattern(normalized))
        return undefined;
    return normalized;
}
function callerExclusionPatterns(patterns) {
    const accepted = [];
    let byteLength = 0;
    for (const pattern of patterns) {
        const normalized = acceptedCallerPattern(pattern, accepted.length, byteLength);
        if (normalized === undefined)
            continue;
        accepted.push(normalized);
        byteLength += normalized.length;
    }
    return accepted;
}
/** Filters repository-relative discovery paths with bounded `*`, `?`, and `**` caller exclusion globs. */
export function filterWorkspaceDiscoveryPaths(paths, excludePatterns) {
    const acceptedPatterns = callerExclusionPatterns(excludePatterns);
    return paths
        .map(normalizeWorkspacePath)
        .filter((path) => !acceptedPatterns.some((pattern) => callerGlobMatches(path, pattern)));
}
//# sourceMappingURL=workspace-exclusion-globs.js.map