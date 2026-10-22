import { isHttpNotFoundText } from "./gh-runner.mjs";

// gh reports a REST 404 only in stderr, with the same exit code as every other
// API failure, so a caller that reads a 404 as absence has to look there.
export function isNotFoundResult(result) {
  return isHttpNotFoundText(result?.stderr);
}

// A failed read that names the endpoint it came from. A caller with its own error convention restates
// it from endpoint and detail.
export class ProjectReadError extends Error {
  constructor(endpoint, detail, options) {
    super(`${endpoint}: ${detail}`, options);
    this.name = "ProjectReadError";
    this.endpoint = endpoint;
    this.detail = detail;
  }
}
