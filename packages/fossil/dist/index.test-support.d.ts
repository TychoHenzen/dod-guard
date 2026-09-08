import type { FossilReport, NormalizedAnalysisOptions } from "./types.js";
export { optionsFor } from "./testing/report-fixtures.js";
export declare const validDirectOptions: NormalizedAnalysisOptions;
export declare const invalidDirectOptionShapes: ({
    days: number;
    gapHours?: undefined;
    threshold?: undefined;
    untrackedAgeDays?: undefined;
    format?: undefined;
    extensions?: undefined;
    exclude?: undefined;
    verbose?: undefined;
} | {
    gapHours: number;
    days?: undefined;
    threshold?: undefined;
    untrackedAgeDays?: undefined;
    format?: undefined;
    extensions?: undefined;
    exclude?: undefined;
    verbose?: undefined;
} | {
    threshold: number;
    days?: undefined;
    gapHours?: undefined;
    untrackedAgeDays?: undefined;
    format?: undefined;
    extensions?: undefined;
    exclude?: undefined;
    verbose?: undefined;
} | {
    untrackedAgeDays: number;
    days?: undefined;
    gapHours?: undefined;
    threshold?: undefined;
    format?: undefined;
    extensions?: undefined;
    exclude?: undefined;
    verbose?: undefined;
} | {
    format: string;
    days?: undefined;
    gapHours?: undefined;
    threshold?: undefined;
    untrackedAgeDays?: undefined;
    extensions?: undefined;
    exclude?: undefined;
    verbose?: undefined;
} | {
    extensions: string[];
    days?: undefined;
    gapHours?: undefined;
    threshold?: undefined;
    untrackedAgeDays?: undefined;
    format?: undefined;
    exclude?: undefined;
    verbose?: undefined;
} | {
    extensions: number[];
    days?: undefined;
    gapHours?: undefined;
    threshold?: undefined;
    untrackedAgeDays?: undefined;
    format?: undefined;
    exclude?: undefined;
    verbose?: undefined;
} | {
    extensions: string;
    days?: undefined;
    gapHours?: undefined;
    threshold?: undefined;
    untrackedAgeDays?: undefined;
    format?: undefined;
    exclude?: undefined;
    verbose?: undefined;
} | {
    exclude: number[];
    days?: undefined;
    gapHours?: undefined;
    threshold?: undefined;
    untrackedAgeDays?: undefined;
    format?: undefined;
    extensions?: undefined;
    verbose?: undefined;
} | {
    exclude: string;
    days?: undefined;
    gapHours?: undefined;
    threshold?: undefined;
    untrackedAgeDays?: undefined;
    format?: undefined;
    extensions?: undefined;
    verbose?: undefined;
} | {
    verbose: string;
    days?: undefined;
    gapHours?: undefined;
    threshold?: undefined;
    untrackedAgeDays?: undefined;
    format?: undefined;
    extensions?: undefined;
    exclude?: undefined;
})[];
export declare function reportFor(options: NormalizedAnalysisOptions): FossilReport;
