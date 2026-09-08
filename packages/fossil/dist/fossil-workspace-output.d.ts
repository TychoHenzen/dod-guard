import type { WorkspaceDebrisFinding } from "./types.js";
import type { WorkspaceDebrisTableMode } from "./fossil-output-types/workspace-debris-table-mode.js";
import type { WorkspaceDebrisTableRow } from "./fossil-output-types/workspace-debris-table-row.js";
/** Produces normal or verbose table rows without changing the underlying debris findings. */
export declare function workspaceDebrisTableRows(findings: readonly WorkspaceDebrisFinding[], mode: WorkspaceDebrisTableMode): readonly WorkspaceDebrisTableRow[];
