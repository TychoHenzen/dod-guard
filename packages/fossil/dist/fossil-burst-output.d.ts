import type { BurstReport } from "./types.js";
import type { BurstTableMode } from "./fossil-output-types/burst-table-mode.js";
import type { BurstTableRenderOptions } from "./fossil-output-types/burst-table-render-options.js";
import type { BurstTableRow } from "./fossil-output-types/burst-table-row.js";
/** Produces deterministic burst, survivor, and candidate rows. */
export declare function burstTableRows(bursts: readonly BurstReport[], mode?: BurstTableMode): readonly BurstTableRow[];
/** Renders burst rows with caller-owned TTY styling control. */
export declare function renderBurstTableRows(rows: readonly BurstTableRow[], { isTty }: BurstTableRenderOptions): string;
