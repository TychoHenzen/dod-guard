import type { BrowserCoreReply } from "./browser-core-reply.js";
import type { BrowserHttpResponse } from "./browser-http-response.js";

export const csp =
  [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
export const routes: Record<string, string> = {
  "/api/search": "code_search",
  "/api/focus": "code_focus",
  "/api/follow": "code_follow",
  "/api/history": "code_history",
  "/api/status": "code_status",
};

const statusByCode: Record<string, number> = {
  invalid_browser_origin: 403,
  invalid_browser_session: 403,
  route_not_found: 404,
  method_not_allowed: 405,
  browser_session_expired: 410,
  resource_limit: 413,
  project_capacity: 429,
  http_capacity: 429,
};

export function browserError(
  code: string,
  retryable = false,
): BrowserCoreReply {
  return { schema_version: 1, code, message: code, retryable };
}

export function errorStatus(code: string): number {
  if (code.startsWith("backend_") || code === "workspace_unavailable")
    return 503;
  return statusByCode[code] ?? 400;
}

export function json(
  status: number,
  payload: BrowserCoreReply,
): BrowserHttpResponse {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": csp,
    },
    body: JSON.stringify(payload),
  };
}
export { isRecord, validBody } from "./router-validation.js";
