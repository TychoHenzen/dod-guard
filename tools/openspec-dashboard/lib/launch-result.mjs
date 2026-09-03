// launch-result.mjs - the narrow public result contract for dashboard-owned launches.

const STABLE_CODES = new Set([
  "invalid_launch_request",
  "invalid_dashboard_capability",
  "launch_request_limit",
  "stale_project_registry",
  "project_not_registered",
  "project_unavailable",
  "code_explorer_unavailable",
  "invalid_code_explorer_url",
  "code_explorer_start_failed",
  "code_explorer_start_timeout",
  "code_explorer_output_limit",
  "code_explorer_capacity",
  "dashboard_shutting_down",
]);

const RETRYABLE_CODES = new Set([
  "project_unavailable",
  "code_explorer_unavailable",
  "invalid_code_explorer_url",
  "code_explorer_start_failed",
  "code_explorer_start_timeout",
  "code_explorer_output_limit",
  "code_explorer_capacity",
]);

/** Convert any internal launch error into the browser's fixed, non-sensitive envelope. */
export function launchFailure(error) {
  const code = STABLE_CODES.has(error?.message) ? error.message : "code_explorer_start_failed";
  return { code, message: code, retryable: RETRYABLE_CODES.has(code) };
}

/** Return only the documented launch success shape, or a redacted failure envelope. */
export async function launchResult(operation) {
  try {
    const result = await operation();
    return { state: result.state, url: result.url, reused: result.reused };
  } catch (error) {
    return launchFailure(error);
  }
}
