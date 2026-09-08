import {
  type CodeExplorerError,
  codeExplorerError,
  normalizeError,
} from "../navigation/error.js";
import {
  BackendCapacityError,
  BackendTimeoutError,
  type ResourceLimit,
} from "../navigation/resource-limits.js";
import { SessionCapacityError } from "../navigation/session.js";
import { ProjectPathError } from "../semantic/api/public-api.js";

export function unknownTool(): CodeExplorerError {
  return codeExplorerError("unknown_tool");
}

export function invalidRequest(): CodeExplorerError {
  return codeExplorerError("invalid_request");
}

export function pathOutsideProject(): CodeExplorerError {
  return codeExplorerError("path_outside_project");
}

export function resourceLimit(): CodeExplorerError {
  return codeExplorerError("resource_limit");
}

export function limitedResource(limit: ResourceLimit): CodeExplorerError {
  return codeExplorerError("resource_limit", limit);
}

export function backendTimeout(): CodeExplorerError {
  return codeExplorerError("backend_timeout");
}

export function invalidSession(): CodeExplorerError {
  return codeExplorerError("invalid_session");
}

export function projectCapacity(): CodeExplorerError {
  return codeExplorerError("project_capacity");
}

export function invalidViewHandle(): CodeExplorerError {
  return codeExplorerError("invalid_view_handle");
}

export function staleView(): CodeExplorerError {
  return codeExplorerError("stale_view");
}

export function requestIdConflict(): CodeExplorerError {
  return codeExplorerError("request_id_conflict");
}

export function normalizeBackendFailure(error: unknown): CodeExplorerError {
  if (error instanceof BackendTimeoutError) return backendTimeout();
  if (error instanceof BackendCapacityError) return resourceLimit();
  if (error instanceof SessionCapacityError) return projectCapacity();
  if (error instanceof ProjectPathError) return codeExplorerError(error.code);
  return normalizeError(error);
}
