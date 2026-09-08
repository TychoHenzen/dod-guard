import type { RawAnalyzeOptions } from "./fossil-cli-types/index.js";
import type { NormalizedAnalysisOptions } from "./types.js";
export declare function normalizedNumberOptions(options: RawAnalyzeOptions): Pick<NormalizedAnalysisOptions, "days" | "gapHours" | "threshold" | "untrackedAgeDays">;
