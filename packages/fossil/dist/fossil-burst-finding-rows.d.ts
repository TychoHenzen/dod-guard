import type { BurstReport } from "./types.js";
import type { BurstTableMode } from "./fossil-output-types/burst-table-mode.js";
import type { BurstTableRow } from "./fossil-output-types/burst-table-row.js";
declare function findingTableRows(burst: BurstReport, mode: BurstTableMode): BurstTableRow[];
export { findingTableRows };
