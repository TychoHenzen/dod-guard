import { ProjectReadError, readSlurpedPages } from "./project-reads.mjs";

export class SnapshotReadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "SnapshotReadError";
  }
}

// Every failed read names its endpoint. An error built here passes through atEndpoint unchanged, so
// the message points at the read nearest the failure.
export function readFailure(endpoint, detail, cause) {
  return new SnapshotReadError(`closure snapshot read failed: ${endpoint}: ${detail}`, { cause });
}

export function messageOf(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// The read failure for one item or value: the subject leads the detail, as in "item PVTI_1 has ...".
export function siteFailure(site, detail) {
  return readFailure(site.endpoint, `${site.subject} ${detail}`);
}

// project-reads names a failed read by endpoint and detail, so its failures are restated as read
// failures with the same text. A read failure the runner threw passes through unchanged, also when the
// listing wrapped it, so the message names the failed read once.
export function projectRead(work) {
  try {
    return work();
  } catch (error) {
    if (!(error instanceof ProjectReadError)) {
      throw error;
    }
    if (error.cause instanceof SnapshotReadError) {
      throw error.cause;
    }
    throw readFailure(error.endpoint, error.detail, error);
  }
}

export function readPages(read, endpoint) {
  return projectRead(() => readSlurpedPages(read, endpoint));
}

// The GitHub readers' own shape checks name an endpoint only inside their text, so their failures are
// restated as read failures for the endpoint they came from. A read failure built here passes through
// unchanged, also when the reader wrapped it to name its endpoint, so the message names the failed
// read once.
export function atEndpoint(endpoint, work) {
  try {
    return work();
  } catch (error) {
    if (error instanceof SnapshotReadError) {
      throw error;
    }
    if (error?.cause instanceof SnapshotReadError) {
      throw error.cause;
    }
    throw readFailure(endpoint, messageOf(error), error);
  }
}
