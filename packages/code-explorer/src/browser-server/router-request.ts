import type { BrowserHttpRequest } from "./browser-http-request.js";
import type { BrowserHttpResponse } from "./browser-http-response.js";
import type { BrowserRouterContext } from "./router-context.js";
import { navigation } from "./router-navigation.js";
import {
  browserError,
  isRecord,
  json,
  routes,
  validBody,
} from "./router-policy.js";
import { requestRejection } from "./router-rejection.js";
import { session } from "./router-session.js";

const maxBodyBytes = 64 * 1024;
const maxResponseBytes = 1024 * 1024;

function parseJson(
  request: BrowserHttpRequest,
): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(request.body.toString("utf8"));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function postBodyError(
  request: BrowserHttpRequest,
): BrowserHttpResponse | undefined {
  if (
    request.headers["content-encoding"] ||
    request.headers["content-type"] !== "application/json"
  )
    return json(400, browserError("invalid_request"));
  if (request.body.byteLength > maxBodyBytes)
    return json(413, browserError("resource_limit"));
  return undefined;
}

async function postRequest(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
): Promise<BrowserHttpResponse> {
  const bodyError = postBodyError(request);
  if (bodyError) return bodyError;
  const body = parseJson(request);
  if (!(body && validBody(request.path, body)))
    return json(400, browserError("invalid_request"));
  const response = await postRoute(context, request, body);
  return responseWithinLimit(response);
}

function postRoute(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
  body: Record<string, unknown>,
): Promise<BrowserHttpResponse> {
  if (request.path === "/api/session")
    return session(context, body, request.headers);
  return navigation({
    context,
    route: request.path,
    body,
    headers: request.headers,
  });
}

function responseWithinLimit(
  response: BrowserHttpResponse,
): BrowserHttpResponse {
  if (Buffer.byteLength(response.body) > maxResponseBytes)
    return json(413, browserError("resource_limit"));
  return response;
}

export async function handleRequest(
  context: BrowserRouterContext,
  request: BrowserHttpRequest,
): Promise<BrowserHttpResponse> {
  const rejection = requestRejection(context, request);
  if (rejection) return rejection;
  context.active.value += 1;
  try {
    return await postRequest(context, request);
  } finally {
    context.active.value -= 1;
  }
}
