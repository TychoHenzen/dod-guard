import { filterWorkspaceDiscoveryPaths } from "./workspace-exclusion-globs.js";
import { isDependencyStorePath, isSensitiveWorkspacePath } from "./workspace-path-rules.js";
/** Parses Git's NUL-delimited path output without changing valid path characters. */
export function parseNulDelimitedPaths(output) {
    return output.split("\0").filter((path) => path !== "");
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
//# sourceMappingURL=workspace-metadata.js.map