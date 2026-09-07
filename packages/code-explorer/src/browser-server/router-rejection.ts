import type { BrowserHttpRequest } from "./browser-http-request.js";
import type { BrowserHttpResponse } from "./browser-http-response.js";
import type { BrowserRouterContext } from "./router-context.js";
import { asset } from "./router-asset.js";
import { browserError, json, routes } from "./router-policy.js";

function authorityError(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
): BrowserHttpResponse | undefined {
  if (request.headers.host === new URL(context.options.origin).host)
    return undefined;
  return json(403, browserError("invalid_browser_origin"));
}

function apiOriginError(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
): BrowserHttpResponse | undefined {
  if (
    !request.path.startsWith("/api/") ||
    request.headers.origin === context.options.origin
  )
    return undefined;
  return json(403, browserError("invalid_browser_origin"));
}

function postPathError(
  request: BrowserHttpRequest,
): BrowserHttpResponse | undefined {
  if (request.path === "/") return json(400, browserError("invalid_request"));
  if (request.path in routes || request.path === "/api/session")
    return undefined;
  return json(404, browserError("route_not_found"));
}

function methodResult(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
): BrowserHttpResponse | Promise<BrowserHttpResponse> | undefined {
  if (request.method === "OPTIONS")
    return json(405, browserError("method_not_allowed"));
  if (request.method === "GET" || request.method === "HEAD")
    return asset(context, request);
  if (request.method !== "POST")
    return json(405, browserError("method_not_allowed"));
  return undefined;
}

function capacityResponse(
  context: BrowserRouterContext,
): BrowserHttpResponse | undefined {
  if (context.active.value < context.maxInFlight) return undefined;
  return json(429, browserError("http_capacity", true));
}

export function requestRejection(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
): BrowserHttpResponse | Promise<BrowserHttpResponse> | undefined {
  return originRejection(context, request) ?? routeRejection(context, request);
}

function originRejection(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
): BrowserHttpResponse | undefined {
  return authorityError(context, request) ?? apiOriginError(context, request);
}

function routeRejection(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
): BrowserHttpResponse | Promise<BrowserHttpResponse> | undefined {
  return (
    methodResult(context, request) ??
    postPathError(request) ??
    capacityResponse(context)
  );
}
