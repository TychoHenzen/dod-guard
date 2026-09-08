/** Public compatibility boundary for fossil report presentation helpers. */
export { burstTableRows, renderBurstTableRows } from "./fossil-burst-output.js";
export { candidateFindingCounts, finalizeFossilReport, renderFossilReportJson } from "./fossil-report-output.js";
export { terminalSafeText } from "./fossil-output-text.js";
export { workspaceDebrisTableRows } from "./fossil-workspace-output.js";
export type { BurstTableMode, BurstTableRenderOptions, BurstTableRow, CandidateFindingCounts, WorkspaceDebrisTableMode, WorkspaceDebrisTableRow, } from "./fossil-output-types/index.js";
