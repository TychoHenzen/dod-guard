import { posix } from "node:path";
import { analyzeReferences } from "./ref-analyzer.js";
/** Exact Git arguments for non-ignored, NUL-delimited untracked paths. */
export const UNTRACKED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--exclude-standard"];
/** Exact Git arguments for ignored, NUL-delimited workspace paths. */
export const IGNORED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"];
/** Exact Git arguments for NUL-delimited verbose ignore provenance. */
export const CHECK_IGNORE_ARGUMENTS = ["check-ignore", "-z", "-v", "--stdin"];
const DEPENDENCY_STORE_SEGMENTS = new Set(["node_modules", "vendor", ".pnpm-store", ".yarn", ".cargo"]);
const SENSITIVE_DIRECTORY_SEGMENTS = new Set([".aws", ".ssh", ".gnupg", ".kube"]);
const SENSITIVE_BASENAMES = new Set([".env", ".npmrc", ".pypirc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);
const SENSITIVE_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".kdbx"];
const MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH = 256;
const MAXIMUM_CALLER_EXCLUSION_GLOBS = 64;
const MAXIMUM_CALLER_EXCLUSION_GLOB_BYTES = 4_096;
/** Parses Git's NUL-delimited path output without changing valid path characters. */
export function parseNulDelimitedPaths(output) {
    return output.split("\0").filter((path) => path !== "");
}
function normalizePath(path) {
    return path.replaceAll("\\", "/");
}
function isDependencyStorePath(path) {
    return normalizePath(path)
        .split("/")
        .some((segment) => DEPENDENCY_STORE_SEGMENTS.has(segment));
}
function isSensitiveWorkspacePath(path) {
    const segments = normalizePath(path)
        .split("/")
        .map((segment) => segment.toLowerCase());
    const name = segments.at(-1) ?? "";
    return (segments.some((segment) => SENSITIVE_DIRECTORY_SEGMENTS.has(segment)) ||
        SENSITIVE_BASENAMES.has(name) ||
        name.startsWith(".env.") ||
        name.startsWith("credentials") ||
        SENSITIVE_EXTENSIONS.some((extension) => name.endsWith(extension)));
}
function callerGlobMatches(path, pattern) {
    const normalizedPattern = normalizePath(pattern);
    if (normalizedPattern.length === 0 || normalizedPattern.length > MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH)
        return false;
    let previous = Array(path.length + 1).fill(false);
    previous[0] = true;
    for (let index = 0; index < normalizedPattern.length; index += 1) {
        const character = normalizedPattern[index];
        const recursiveWildcard = character === "*" && normalizedPattern[index + 1] === "*";
        if (recursiveWildcard)
            index += 1;
        const current = Array(path.length + 1).fill(false);
        for (let pathIndex = 0; pathIndex <= path.length; pathIndex += 1) {
            if (character === "*") {
                current[pathIndex] =
                    previous[pathIndex] ||
                        (pathIndex > 0 && (recursiveWildcard || path[pathIndex - 1] !== "/") && current[pathIndex - 1]);
            }
            else if (pathIndex > 0 && character === "?")
                current[pathIndex] = path[pathIndex - 1] !== "/" && previous[pathIndex - 1];
            else if (pathIndex > 0)
                current[pathIndex] = character === path[pathIndex - 1] && previous[pathIndex - 1];
        }
        previous = current;
    }
    return previous[path.length];
}
function callerExclusionPatterns(patterns) {
    const accepted = [];
    let byteLength = 0;
    for (const pattern of patterns) {
        const normalized = normalizePath(pattern);
        if (accepted.length >= MAXIMUM_CALLER_EXCLUSION_GLOBS ||
            normalized.length === 0 ||
            normalized.length > MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH ||
            byteLength + normalized.length > MAXIMUM_CALLER_EXCLUSION_GLOB_BYTES ||
            normalized.includes("\0") ||
            normalized.startsWith("/") ||
            normalized.split("/").includes(".."))
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
        .map(normalizePath)
        .filter((path) => !acceptedPatterns.some((pattern) => callerGlobMatches(path, pattern)));
}
/** Reads metadata only for discovered paths outside known dependency-store segments. */
export function inspectWorkspaceFileMetadata(paths, readMetadata) {
    return inspectWorkspaceFileMetadataWithWarnings(paths, readMetadata).metadata;
}
/** Reads no-follow metadata, reporting unreadable discovered paths without exposing reader errors. */
export function inspectWorkspaceFileMetadataWithWarnings(paths, readMetadata, excludePatterns = []) {
    const metadata = [];
    const warnings = [];
    for (const normalizedPath of filterWorkspaceDiscoveryPaths(paths, excludePatterns)) {
        if (isDependencyStorePath(normalizedPath) || isSensitiveWorkspacePath(normalizedPath))
            continue;
        try {
            const file = readMetadata(normalizedPath);
            if (file.isSymbolicLink || file.isJunction)
                continue;
            metadata.push({ ...file, path: normalizedPath });
        }
        catch {
            warnings.push({
                code: "workspace_unreadable",
                message: "Workspace path could not be inspected.",
                path: normalizedPath,
            });
        }
    }
    warnings.sort((left, right) => {
        const leftPath = left.path ?? "";
        const rightPath = right.path ?? "";
        return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
    });
    return { metadata, warnings };
}
function classifyIgnoreSource(sourcePath, globalExcludePath) {
    const normalizedSource = normalizePath(sourcePath);
    if (normalizedSource === ".git/info/exclude" || normalizedSource.endsWith("/.git/info/exclude"))
        return "local-exclude";
    if (globalExcludePath && normalizePath(globalExcludePath) === normalizedSource)
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
function normalizedRepositoryPath(path) {
    return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
}
function basename(path) {
    return normalizedRepositoryPath(path).split("/").at(-1) ?? "";
}
function sourceStringValues(content) {
    const values = [];
    const matcher = /(["'`])([^"'`\r\n]+)\1/g;
    for (let match = matcher.exec(content); match; match = matcher.exec(content)) {
        const value = match[2];
        if (value !== undefined)
            values.push(normalizedRepositoryPath(value));
    }
    return values;
}
/** Detects resolved imports and exact source-string evidence that an old workspace candidate is in use. */
export function hasInboundWorkspaceUsage(candidatePath, sources, inventoryPaths) {
    const normalizedCandidate = normalizedRepositoryPath(candidatePath);
    const graph = analyzeReferences(sources);
    if (graph.edges.some((edge) => normalizedRepositoryPath(edge.targetPath) === normalizedCandidate &&
        normalizedRepositoryPath(edge.sourcePath) !== normalizedCandidate))
        return true;
    const candidateBasename = basename(normalizedCandidate);
    const normalizedInventory = new Set([...inventoryPaths, candidatePath].map(normalizedRepositoryPath));
    const basenameCount = [...normalizedInventory].filter((path) => basename(path) === candidateBasename).length;
    return sources.some((source) => {
        if (normalizedRepositoryPath(source.path) === normalizedCandidate)
            return false;
        return sourceStringValues(source.content).some((value) => value === normalizedCandidate || (basenameCount === 1 && value === candidateBasename));
    });
}
/** Omits workspace candidates when any inbound repository-contained usage evidence is found. */
export function omitUsedWorkspaceCandidates(candidates, sources, inventoryPaths) {
    return candidates.filter((candidate) => !hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths));
}
/** Creates a separate advisory workspace-debris finding when no inbound usage evidence is discovered. */
export function workspaceDebrisFinding(candidate, sources, inventoryPaths, analysisBoundary, unobservedMechanisms) {
    if (hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths))
        return undefined;
    return {
        classification: "advisory",
        review: "possible workspace debris",
        path: candidate.path,
        kind: candidate.kind,
        modifiedTimestampMs: candidate.modifiedTimestampMs,
        ageSource: "mtime",
        ageUncertainty: "Modification time is filesystem metadata. Copying, restoring, extracting, or rebuilding can change it.",
        ignore: "ignore" in candidate ? candidate.ignore : undefined,
        detectedReferenceEvidence: [],
        analysisBoundary,
        unobservedReferenceMechanisms: unobservedMechanisms,
    };
}
//# sourceMappingURL=workspace-debris.js.map