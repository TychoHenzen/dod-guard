const FAILURE_CATEGORIES = Object.freeze({
  MCP_RATE_LIMIT: "mcp_rate_limit",
  TRANSPORT_UNAVAILABLE: "transport_unavailable",
  AUTHENTICATION: "authentication",
  PERMISSION: "permission",
  MALFORMED: "malformed",
  TIMEOUT: "timeout",
  UNSUPPORTED: "unsupported",
  REST_RATE_LIMIT: "rest_rate_limit",
  PROVIDER: "provider",
});

const REST_ENDPOINTS = Object.freeze({
  repository: "GET /repos/{repository}",
  project: "GET /users/{owner}/projectsV2/{number}",
  projectItems: "GET /users/{owner}/projectsV2/{number}/items",
  issue: "GET /repos/{repository}/issues/{issueNumber}",
  pullRequest: "GET /repos/{repository}/pulls/{pullNumber}",
  reviewComments: "GET /repos/{repository}/pulls/{pullNumber}/comments",
  branchRef: "GET /repos/{repository}/git/ref/heads/{branch}",
  checks: "GET /repos/{repository}/commits/{headSha}/check-runs",
  workflowRuns: "GET /repos/{repository}/actions/workflows/{workflow}/runs",
  labels: "GET /repos/{repository}/labels",
  contents: "GET /repos/{repository}/contents/{path}",
  protection: "GET /repos/{repository}/branches/{branch}/protection",
});

const RATE_LIMIT_MARKER = /rate[\s-]?limit|secondary[\s-]?limit|too many requests|\b429\b/i;
const AUTHENTICATION_MARKER = /authentication|unauthori[sz]ed|invalid token|missing credentials|\b401\b/i;
const TIMEOUT_MARKER = /timed? ?out|timeout|\b408\b/i;
const TRANSPORT_UNAVAILABLE_MARKER = /(?:mcp|connector|transport)(?: is| was)? unavailable/i;
const SENSITIVE_KEY = /authorization|credential|password|secret|token|api[\s_-]?key|pat/i;

function errorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error?.message === "string") {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Provider operation failed.";
}

function redactedText(value) {
  return String(value ?? "")
    .replace(/(authorization|credential|password|secret|token|api[\s_-]?key|pat)(\s*[:=]\s*)([^\s,;]+)/gi, "$1$2[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]");
}

function redact(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactedText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => redact(entry, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : redact(entry, seen)]),
  );
}

function statusValue(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  const number = Number(status);
  return Number.isInteger(number) ? number : null;
}

function codeValue(error) {
  const code = error?.code ?? error?.response?.data?.code;
  return typeof code === "string" ? code.toLowerCase() : null;
}

function explicitCategory(error) {
  const category = error?.category ?? error?.failureCategory ?? error?.details?.category;
  return typeof category === "string" ? category.toLowerCase().replace(/[\s-]+/g, "_") : null;
}

function explicitTransport(error, source) {
  const transport = error?.transport ?? error?.source ?? error?.details?.transport;
  const value = typeof transport === "string" ? transport.toLowerCase() : source;
  return ["connector", "typed_connector", "mcp"].includes(value) ? "mcp" : value;
}

function categoryFromExplicitValue(category, transport) {
  if (!category) return null;
  if (["mcp_rate_limit", "mcp_ratelimit"].includes(category)) return FAILURE_CATEGORIES.MCP_RATE_LIMIT;
  if (["rest_rate_limit", "rest_ratelimit"].includes(category)) return FAILURE_CATEGORIES.REST_RATE_LIMIT;
  if (["rate_limit", "ratelimit", "secondary_rate_limit"].includes(category)) {
    return transport === "mcp" ? FAILURE_CATEGORIES.MCP_RATE_LIMIT : FAILURE_CATEGORIES.REST_RATE_LIMIT;
  }
  if (["auth", "authentication", "unauthorized"].includes(category)) return FAILURE_CATEGORIES.AUTHENTICATION;
  if (["permission", "forbidden", "entitlement", "authorization"].includes(category)) return FAILURE_CATEGORIES.PERMISSION;
  if (["invalid", "malformed", "validation", "response_shape"].includes(category)) return FAILURE_CATEGORIES.MALFORMED;
  if (["timeout", "timed_out"].includes(category)) return FAILURE_CATEGORIES.TIMEOUT;
  if (["unsupported", "not_supported", "capability_gap"].includes(category)) return FAILURE_CATEGORIES.UNSUPPORTED;
  if (["transport_unavailable", "mcp_unavailable", "connector_unavailable"].includes(category)) {
    return FAILURE_CATEGORIES.TRANSPORT_UNAVAILABLE;
  }
  return category === "provider" ? FAILURE_CATEGORIES.PROVIDER : null;
}

export function classifyTransportFailure(error, source = "mcp") {
  const transport = explicitTransport(error, source);
  const status = statusValue(error);
  const code = codeValue(error);
  const message = errorMessage(error);
  const explicit = categoryFromExplicitValue(explicitCategory(error), transport);
  if (explicit) return { transport, category: explicit, status, code, message: redactedText(message) };

  if (status === 401 || AUTHENTICATION_MARKER.test(message) || code === "unauthorized") {
    return { transport, category: FAILURE_CATEGORIES.AUTHENTICATION, status, code, message: redactedText(message) };
  }
  if (TRANSPORT_UNAVAILABLE_MARKER.test(message) || code === "transport_unavailable") {
    return { transport, category: FAILURE_CATEGORIES.TRANSPORT_UNAVAILABLE, status, code, message: redactedText(message) };
  }
  if (RATE_LIMIT_MARKER.test(message) || status === 429 || code === "rate_limit" || code === "secondary_rate_limit") {
    return {
      transport,
      category: transport === "mcp" ? FAILURE_CATEGORIES.MCP_RATE_LIMIT : FAILURE_CATEGORIES.REST_RATE_LIMIT,
      status,
      code,
      message: redactedText(message),
    };
  }
  if (status === 403 || /forbidden|permission|entitlement/i.test(message)) {
    return { transport, category: FAILURE_CATEGORIES.PERMISSION, status, code, message: redactedText(message) };
  }
  if (TIMEOUT_MARKER.test(message) || code === "timeout" || code === "etimedout") {
    return { transport, category: FAILURE_CATEGORIES.TIMEOUT, status, code, message: redactedText(message) };
  }
  return { transport, category: FAILURE_CATEGORIES.PROVIDER, status, code, message: redactedText(message) };
}

function resultFailure(result) {
  if (!result || typeof result !== "object") return null;
  if (result.isError === true) return result.error ?? result;
  if (result.ok === false) return result.error ?? result;
  if (result.error) return result.error;
  return null;
}

function safeRequest(request) {
  return redact(request);
}

function evidenceEntry(operation, request, endpoint, failure) {
  return {
    operation,
    endpoint,
    request: safeRequest(request),
    failure,
  };
}

export class TransportStopError extends Error {
  constructor(details) {
    super(`GitHub ${details.operation} stopped after ${details.category}.`);
    this.name = "TransportStopError";
    this.code = "transport_stop";
    this.details = details;
  }
}

export async function runTransport({
  operation,
  request,
  primary,
  rest,
  restEndpoint,
  evidence = [],
}) {
  if (typeof primary !== "function") throw new TypeError("primary transport must be a function.");
  const endpoint = restEndpoint ?? REST_ENDPOINTS[operation] ?? null;
  let primaryResult;
  try {
    primaryResult = await primary(request);
    const failure = resultFailure(primaryResult);
    if (failure) throw failure;
    return { value: primaryResult, transport: "mcp", primaryFailure: null };
  } catch (error) {
    const primaryFailure = classifyTransportFailure(error, "mcp");
    const primaryEvidence = evidenceEntry(operation, request, endpoint, primaryFailure);
    if (Array.isArray(evidence)) evidence.push(primaryEvidence);
    const canFallback = primaryFailure.transport === "mcp" &&
      [FAILURE_CATEGORIES.MCP_RATE_LIMIT, FAILURE_CATEGORIES.TRANSPORT_UNAVAILABLE].includes(primaryFailure.category) &&
      typeof rest === "function" && typeof endpoint === "string" && endpoint.length > 0;
    if (!canFallback) {
      throw new TransportStopError({
        operation,
        category: primaryFailure.category,
        endpoint,
        request: safeRequest(request),
        primaryFailure,
      });
    }

    try {
      const restResult = await rest(request);
      const restFailureValue = resultFailure(restResult);
      if (restFailureValue) throw restFailureValue;
      return {
        value: restResult,
        transport: "rest",
        endpoint,
        primaryFailure,
      };
    } catch (restError) {
      const restFailure = classifyTransportFailure(restError, "rest");
      if (Array.isArray(evidence)) evidence.push(evidenceEntry(operation, request, endpoint, restFailure));
      throw new TransportStopError({
        operation,
        category: restFailure.category,
        endpoint,
        request: safeRequest(request),
        primaryFailure,
        restFailure,
      });
    }
  }
}

export { FAILURE_CATEGORIES, REST_ENDPOINTS };
