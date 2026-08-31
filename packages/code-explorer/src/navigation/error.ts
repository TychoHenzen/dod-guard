export const errorCodes = [
  "unknown_tool",
  "invalid_request",
  "invalid_session",
  "invalid_view_handle",
  "stale_view",
  "request_id_conflict",
  "resource_limit",
  "project_capacity",
  "workspace_unavailable",
  "backend_timeout",
  "backend_crashed",
  "backend_unavailable",
  "unavailable_relation",
  "invalid_backend_result",
  "backend_response_limit",
  "path_outside_project",
  "path_identity_unavailable",
  "path_identity_changed",
  "invalid_project_root",
  "project_root_inaccessible",
  "project_root_unavailable",
  "backend_identity_unverifiable",
  "backend_identity_changed",
  "backend_endpoint_rejected",
  "backend_write_rejected",
  "backend_capability_rejected",
  "unsafe_backend_mode",
  "unsupported_backend_version",
  "classification_config_invalid",
  "freshness_unavailable",
  "incomplete_write",
  "scan_limit",
  "workspace_churn",
  "refresh_failed",
  "internal_error",
] as const;

export type CodeExplorerErrorCode = (typeof errorCodes)[number];
export type ErrorDetails = {
  field?: string;
  limit?: number;
  actual?: number;
  view_generation?: number;
  current_generation?: number;
  state?: string;
  path?: string;
};
export type CodeExplorerError = {
  schema_version: 1;
  code: CodeExplorerErrorCode;
  message: CodeExplorerErrorCode;
  retryable: boolean;
  details?: ErrorDetails;
};

const retryableCodes = new Set<CodeExplorerErrorCode>([
  "invalid_session",
  "project_capacity",
  "workspace_unavailable",
  "backend_timeout",
  "backend_crashed",
  "backend_unavailable",
  "path_identity_changed",
  "project_root_inaccessible",
  "freshness_unavailable",
  "incomplete_write",
  "workspace_churn",
  "refresh_failed",
]);

const codeSet = new Set<string>(errorCodes);
const detailKeys = new Set<keyof ErrorDetails>([
  "field",
  "limit",
  "actual",
  "view_generation",
  "current_generation",
  "state",
  "path",
]);

export function codeExplorerError(code: CodeExplorerErrorCode, details?: ErrorDetails): CodeExplorerError {
  return {
    schema_version: 1,
    code,
    message: code,
    retryable: retryableCodes.has(code),
    ...(details && Object.keys(details).length > 0 ? { details: sanitizeDetails(details) } : {}),
  };
}

export function normalizeError(error: unknown): CodeExplorerError {
  const message = error instanceof Error ? error.message : undefined;
  return codeExplorerError(message && codeSet.has(message) ? (message as CodeExplorerErrorCode) : "internal_error");
}

function sanitizeDetails(details: ErrorDetails): ErrorDetails {
  return Object.fromEntries(
    Object.entries(details).filter(([key, value]) => {
      if (!detailKeys.has(key as keyof ErrorDetails)) return false;
      if (key === "path") return typeof value === "string" && isNormalizedProjectRelativePath(value);
      return typeof value === "string" || typeof value === "number";
    }),
  ) as ErrorDetails;
}

function isNormalizedProjectRelativePath(value: string): boolean {
  return value.length > 0 && !value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value) && !value.includes("\\") && !value.split("/").includes("..");
}
