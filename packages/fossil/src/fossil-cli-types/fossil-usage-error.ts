/** A command-line usage failure that callers map to the standard usage exit code. */
export class FossilUsageError extends Error {
  readonly exitCode = 2;

  constructor(
    message: string,
    readonly reported = false,
  ) {
    super(message);
  }
}
