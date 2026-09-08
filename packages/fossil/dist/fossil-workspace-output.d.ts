import type { WorkspaceDebrisFinding } from "./types.js";
import type { WorkspaceDebrisTableMode, WorkspaceDebrisTableRow } from "./fossil-output-types/index.js";
/** Produces normal or verbose rows without changing debris findings. */
export declare function workspaceDebrisTableRows(findings: readonly WorkspaceDebrisFinding[], mode: WorkspaceDebrisTableMode): readonly WorkspaceDebrisTableRow[];
