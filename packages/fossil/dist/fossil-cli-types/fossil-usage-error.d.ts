/** A command-line usage failure mapped to the standard exit code. */
export declare class FossilUsageError extends Error {
    readonly reported: boolean;
    readonly exitCode = 2;
    constructor(message: string, reported?: boolean);
}
