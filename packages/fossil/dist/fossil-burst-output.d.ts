import type { BurstReport } from "./types.js";
import type { BurstTableMode } from "./fossil-output-types/burst-table-mode.js";
import type { BurstTableRenderOptions } from "./fossil-output-types/burst-table-render-options.js";
import type { BurstTableRow } from "./fossil-output-types/burst-table-row.js";
/** Produces deterministic burst, survivor, and candidate rows in their required table order. */
export declare function burstTableRows(bursts: readonly BurstReport[], mode?: BurstTableMode): readonly BurstTableRow[];
/** Renders current burst table rows with explicit caller-owned TTY styling control. */
export declare function renderBurstTableRows(rows: readonly BurstTableRow[], { isTty }: BurstTableRenderOptions): string;
