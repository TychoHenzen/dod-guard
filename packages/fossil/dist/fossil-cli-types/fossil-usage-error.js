/** A command-line usage failure mapped to the standard exit code. */
export class FossilUsageError extends Error {
    reported;
    exitCode = 2;
    constructor(message, reported = false) {
        super(message);
        this.reported = reported;
    }
}
//# sourceMappingURL=fossil-usage-error.js.map