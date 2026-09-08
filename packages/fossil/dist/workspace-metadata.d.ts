import type { WorkspaceFileMetadata } from "./workspace-types/workspace-file-metadata.js";
import type { WorkspaceFileMetadataReader } from "./workspace-types/workspace-file-metadata-reader.js";
import type { WorkspaceMetadataInspectionResult } from "./workspace-types/workspace-metadata-inspection-result.js";
/** Parses Git's NUL-delimited path output without changing valid path characters. */
export declare function parseNulDelimitedPaths(output: string): readonly string[];
/** Reads metadata only for discovered paths outside known dependency-store segments. */
export declare function inspectWorkspaceFileMetadata(paths: readonly string[], readMetadata: WorkspaceFileMetadataReader): readonly WorkspaceFileMetadata[];
/** Reads no-follow metadata, reporting unreadable discovered paths without exposing reader errors. */
export declare function inspectWorkspaceFileMetadataWithWarnings(paths: readonly string[], readMetadata: WorkspaceFileMetadataReader, excludePatterns?: readonly string[]): WorkspaceMetadataInspectionResult;
