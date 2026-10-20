// The one place complete-pr's scripts start the GitHub CLI, and the JSON reads built on it. Every
// caller passes the exit codes it can read; a caller that passes none treats any non-zero exit as a
// failure.
// biome-ignore lint/correctness/noNodejsModules: This adapter invokes the local GitHub CLI from Node.
import { spawnSync } from "node:child_process";
import { CompletionError } from "./completion-error.mjs";

// One REST page of Project items reaches about 3.5 MB on the live Project, far past Node's 1 MiB default.
const GH_OUTPUT_MAX_BUFFER = 64 * 1024 * 1024;

export function runGh(args, acceptedExitCodes = [0], spawn = spawnSync) {
  const result = spawn("gh", args, { encoding: "utf8", windowsHide: true, maxBuffer: GH_OUTPUT_MAX_BUFFER });
  if (result.error) {
    throw result.error;
  }
  if (!acceptedExitCodes.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || `gh exited with ${result.status}`;
    throw new Error(detail);
  }
  return result;
}

export function githubResponseError(endpoint, field) {
  return new CompletionError(
    "github_response_shape",
    `GitHub response for ${endpoint} must include an array ${field}.`,
  );
}

export function githubResponseContractError(endpoint, detail) {
  return new CompletionError("github_response_shape", `GitHub response for ${endpoint} must include ${detail}.`);
}

// An injected runner may return a non-zero exit without throwing, so the exit is checked again here.
export function ghJson(args, acceptedExitCodes = [0], commandRunner = runGh) {
  const result = commandRunner(args, acceptedExitCodes);
  if (!acceptedExitCodes.includes(result.status)) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `gh exited with ${result.status}`);
  }
  let data = null;
  if (result.stdout.trim()) {
    data = JSON.parse(result.stdout);
  }
  return { data, result };
}

export function ghJsonPagesData(endpoint, commandRunner) {
  const { data } = ghJson(["api", "--paginate", "--slurp", endpoint], [0], commandRunner);
  return Array.isArray(data) ? data : [data];
}

export function ghJsonArrayPages(endpoint, commandRunner) {
  const pages = ghJsonPagesData(endpoint, commandRunner);
  if (pages.some((page) => !Array.isArray(page))) {
    throw githubResponseError(endpoint, "an array response");
  }
  return pages.flat();
}

export function ghJsonPages(endpoint, field, commandRunner) {
  const pages = ghJsonPagesData(endpoint, commandRunner);
  if (pages.length === 0) {
    throw githubResponseError(endpoint, field);
  }
  return pages.flatMap((page) => {
    if (!page || typeof page !== "object" || !Array.isArray(page[field])) {
      throw githubResponseError(endpoint, field);
    }
    return page[field];
  });
}

// gh reports only the HTTP status of a failed read, so the endpoint is added here. A response-shape
// error already names its endpoint and keeps its code.
export function readNamed(description, endpoint, read) {
  try {
    return read();
  } catch (error) {
    if (error instanceof CompletionError) {
      throw error;
    }
    throw new Error(`Failed to read ${description} at ${endpoint}: ${errorMessage(error)}`, { cause: error });
  }
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const HTTP_NOT_FOUND = /HTTP 404/u;

// gh reports a REST 404 only in stderr. Callers that already decided the exit code is acceptable match the text alone.
export function isHttpNotFoundText(stderr) {
  return HTTP_NOT_FOUND.test(String(stderr ?? ""));
}

// A gh read that exits 1 with an HTTP 404 means the resource is absent, which several readers treat as empty.
export function isHttpNotFound(result) {
  return result.status === 1 && isHttpNotFoundText(result.stderr);
}
