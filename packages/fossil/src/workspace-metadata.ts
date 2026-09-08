import type { AnalysisWarning } from "./types.js";
import type {
  WorkspaceFileMetadata,
  WorkspaceFileMetadataReader,
  WorkspaceMetadataInspectionResult,
} from "./workspace-types/index.js";
import { filterWorkspaceDiscoveryPaths } from "./workspace-exclusion-globs.js";
import {
  isDependencyStorePath,
  isSensitiveWorkspacePath,
} from "./workspace-path-rules.js";
import { compareText } from "./reference-analysis-paths.js";

/** Parses Git's NUL-delimited path output without changing paths. */
export function parseNulDelimitedPaths(output: string): readonly string[] {
  return output.split("\0").filter((path) => path !== "");
}

/** Reads metadata outside known dependency-store segments. */
export function inspectWorkspaceFileMetadata(
  paths: readonly string[],
  readMetadata: WorkspaceFileMetadataReader,
): readonly WorkspaceFileMetadata[] {
  return inspectWorkspaceFileMetadataWithWarnings(paths, readMetadata).metadata;
}

function inspectWorkspacePath(
  normalizedPath: string,
  readMetadata: WorkspaceFileMetadataReader,
): { metadata?: WorkspaceFileMetadata; warning?: AnalysisWarning } {
  if (
    isDependencyStorePath(normalizedPath) ||
    isSensitiveWorkspacePath(normalizedPath)
  )
    return {};
  try {
    const file = readMetadata(normalizedPath);
    if (file.isSymbolicLink || file.isJunction) return {};
    return { metadata: { ...file, path: normalizedPath } };
  } catch {
    return {
      warning: {
        code: "workspace_unreadable",
        message: "Workspace path could not be inspected.",
        path: normalizedPath,
      },
    };
  }
}

function compareWorkspaceWarnings(
  left: AnalysisWarning,
  right: AnalysisWarning,
): number {
  return compareText(left.path ?? "", right.path ?? "");
}

/** Reads no-follow metadata without exposing reader errors. */
export function inspectWorkspaceFileMetadataWithWarnings(
  paths: readonly string[],
  readMetadata: WorkspaceFileMetadataReader,
  excludePatterns: readonly string[] = [],
): WorkspaceMetadataInspectionResult {
  const metadata: WorkspaceFileMetadata[] = [];
  const warnings: AnalysisWarning[] = [];
  for (const normalizedPath of filterWorkspaceDiscoveryPaths(
    paths,
    excludePatterns,
  )) {
    const result = inspectWorkspacePath(normalizedPath, readMetadata);
    if (result.metadata) metadata.push(result.metadata);
    if (result.warning) warnings.push(result.warning);
  }
  warnings.sort(compareWorkspaceWarnings);
  return { metadata, warnings };
}
