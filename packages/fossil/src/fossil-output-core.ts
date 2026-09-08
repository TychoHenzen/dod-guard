/** Public compatibility boundary for fossil report presentation helpers. */
export { burstTableRows, renderBurstTableRows } from "./fossil-burst-output.js";
export {
  candidateFindingCounts,
  finalizeFossilReport,
  renderFossilReportJson,
} from "./fossil-report-output.js";
export { terminalSafeText } from "./fossil-output-text.js";
export { workspaceDebrisTableRows } from "./fossil-workspace-output.js";
export type { BurstTableMode } from "./fossil-output-types/index.js";
export type { BurstTableRenderOptions } from "./fossil-output-types/index.js";
export type { BurstTableRow } from "./fossil-output-types/index.js";
export type { CandidateFindingCounts } from "./fossil-output-types/index.js";
export type { WorkspaceDebrisTableMode } from "./fossil-output-types/index.js";
export type { WorkspaceDebrisTableRow } from "./fossil-output-types/index.js";
