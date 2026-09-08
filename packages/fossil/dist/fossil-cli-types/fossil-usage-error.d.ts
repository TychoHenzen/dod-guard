/** A command-line usage failure that callers map to the standard usage exit code. */
export declare class FossilUsageError extends Error {
    readonly reported: boolean;
    readonly exitCode = 2;
    constructor(message: string, reported?: boolean);
}
