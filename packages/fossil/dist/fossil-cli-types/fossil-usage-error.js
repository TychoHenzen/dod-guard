/** A command-line usage failure that callers map to the standard usage exit code. */
export class FossilUsageError extends Error {
    reported;
    exitCode = 2;
    constructor(message, reported = false) {
        super(message);
        this.reported = reported;
    }
}
//# sourceMappingURL=fossil-usage-error.js.map