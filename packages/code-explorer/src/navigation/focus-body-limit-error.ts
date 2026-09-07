export class FocusBodyLimitError extends Error {
  constructor(readonly limit: number) {
    super("resource_limit");
  }
}
