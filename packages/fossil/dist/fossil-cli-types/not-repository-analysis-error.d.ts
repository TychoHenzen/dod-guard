import { FossilAnalysisError } from "../analysis-error.js";
/** A compatibility wrapper for non-repository analysis failure. */
export declare class NotRepositoryAnalysisError extends FossilAnalysisError {
    constructor(message?: string);
}
