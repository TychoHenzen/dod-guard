import type { AnalysisWarning } from "../types.js";
import type { WorkspaceFileMetadata } from "./workspace-file-metadata.js";
export interface WorkspaceMetadataInspectionResult {
    readonly metadata: readonly WorkspaceFileMetadata[];
    readonly warnings: readonly AnalysisWarning[];
}
