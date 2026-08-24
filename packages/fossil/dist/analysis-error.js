/** A typed fatal result from repository analysis that callers can handle without parsing text. */
export class FossilAnalysisError extends Error {
    code;
    constructor({ code, message }) {
        super(message);
        this.code = code;
    }
}
//# sourceMappingURL=analysis-error.js.map