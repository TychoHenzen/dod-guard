import { FossilAnalysisError } from "../analysis-error.js";
/** A compatibility wrapper for the dedicated non-repository analysis failure. */
export class NotRepositoryAnalysisError extends FossilAnalysisError {
    constructor(message = "not a Git repository") {
        super({ code: "not_repository", message });
    }
}
//# sourceMappingURL=not-repository-analysis-error.js.map