export class DirectLspError extends Error {
  constructor(
    readonly code:
      | "backend_timeout"
      | "backend_crashed"
      | "backend_failed"
      | "backend_write_rejected"
      | "backend_content_modified",
  ) {
    super(code);
  }
}
