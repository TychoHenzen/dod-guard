import { filterWorkspaceDiscoveryPaths } from "./workspace-exclusion-globs.js";
import { isDependencyStorePath, isSensitiveWorkspacePath, } from "./workspace-path-rules.js";
import { compareText } from "./reference-analysis-paths.js";
/** Parses Git's NUL-delimited path output without changing paths. */
export function parseNulDelimitedPaths(output) {
    return output.split("\0").filter((path) => path !== "");
}
/** Reads metadata outside known dependency-store segments. */
export function inspectWorkspaceFileMetadata(paths, readMetadata) {
    return inspectWorkspaceFileMetadataWithWarnings(paths, readMetadata).metadata;
}
function inspectWorkspacePath(normalizedPath, readMetadata) {
    if (isDependencyStorePath(normalizedPath) ||
        isSensitiveWorkspacePath(normalizedPath))
        return {};
    try {
        const file = readMetadata(normalizedPath);
        if (file.isSymbolicLink || file.isJunction)
            return {};
        return { metadata: { ...file, path: normalizedPath } };
    }
    catch {
        return {
            warning: {
                code: "workspace_unreadable",
                message: "Workspace path could not be inspected.",
                path: normalizedPath,
            },
        };
    }
}
function compareWorkspaceWarnings(left, right) {
    return compareText(left.path ?? "", right.path ?? "");
}
/** Reads no-follow metadata without exposing reader errors. */
export function inspectWorkspaceFileMetadataWithWarnings(paths, readMetadata, excludePatterns = []) {
    const metadata = [];
    const warnings = [];
    for (const normalizedPath of filterWorkspaceDiscoveryPaths(paths, excludePatterns)) {
        const result = inspectWorkspacePath(normalizedPath, readMetadata);
        if (result.metadata)
            metadata.push(result.metadata);
        if (result.warning)
            warnings.push(result.warning);
    }
    warnings.sort(compareWorkspaceWarnings);
    return { metadata, warnings };
}
//# sourceMappingURL=workspace-metadata.js.map