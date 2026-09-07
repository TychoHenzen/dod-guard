export class BackendTimeoutError extends Error {
  constructor() {
    super("backend_timeout");
  }
}
