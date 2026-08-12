// http-error.mjs - an error carrying the status the browser should receive.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
