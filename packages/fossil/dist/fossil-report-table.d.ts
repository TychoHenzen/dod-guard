import type { BurstTableRenderOptions } from "./fossil-output-core.js";
import type { FossilReport } from "./types.js";
/** Renders report statistics, bursts, warnings, and workspace debris in table order. */
export declare function renderFossilReportTable(report: FossilReport, options: BurstTableRenderOptions): string;
