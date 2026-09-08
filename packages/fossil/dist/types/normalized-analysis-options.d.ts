import type { OutputFormat } from "./output-format.js";
export interface NormalizedAnalysisOptions {
    readonly days: number;
    readonly gapHours: number;
    readonly threshold: number;
    readonly format: OutputFormat;
    readonly extensions: readonly string[];
    readonly untrackedAgeDays: number;
    readonly exclude: readonly string[];
    readonly verbose: boolean;
}
