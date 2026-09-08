import type { WorkspaceFileMetadata, WorkspaceFileMetadataReader, WorkspaceMetadataInspectionResult } from "./workspace-types/index.js";
/** Parses Git's NUL-delimited path output without changing paths. */
export declare function parseNulDelimitedPaths(output: string): readonly string[];
/** Reads metadata outside known dependency-store segments. */
export declare function inspectWorkspaceFileMetadata(paths: readonly string[], readMetadata: WorkspaceFileMetadataReader): readonly WorkspaceFileMetadata[];
/** Reads no-follow metadata without exposing reader errors. */
export declare function inspectWorkspaceFileMetadataWithWarnings(paths: readonly string[], readMetadata: WorkspaceFileMetadataReader, excludePatterns?: readonly string[]): WorkspaceMetadataInspectionResult;
