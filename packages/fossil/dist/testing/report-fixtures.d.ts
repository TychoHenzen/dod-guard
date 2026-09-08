import type { FossilReport, NormalizedAnalysisOptions } from "../types.js";
import type { AdvisoryFossilFindingInput } from "../fossil-grader.js";
export declare function optionsFor(format?: NormalizedAnalysisOptions["format"]): NormalizedAnalysisOptions;
export declare function advisoryFindingInput(input: {
    path: string;
    burstId: string;
    score: number;
    burstCommits: number;
}): AdvisoryFossilFindingInput;
export declare function createReport(options: NormalizedAnalysisOptions, overrides?: Partial<FossilReport>): FossilReport;
