/** A command-line usage failure mapped to the standard exit code. */
export class FossilUsageError extends Error {
  readonly exitCode = 2;

  constructor(
    message: string,
    readonly reported = false,
  ) {
    super(message);
  }
}
