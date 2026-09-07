import { Buffer } from "node:buffer";
import { BackendCapacityError } from "./backend-capacity-error.js";
import { BackendRequestLimiter } from "./backend-request-limiter.js";
import { BackendTimeoutError } from "./backend-timeout-error.js";
import { filterLimit } from "./resource-filter-limits.js";
import type { ResourceLimit } from "./resource-limit.js";
import {
  MAX_FILTER_VALUE_BYTES,
  MAX_FILTER_VALUES,
} from "./resource-limit-constants.js";

const MAX_QUERY_CODE_POINTS = 1024;

export {
  MAX_FILTER_VALUE_BYTES,
  MAX_FILTER_VALUES,
} from "./resource-limit-constants.js";

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_CANDIDATES = 200;
const MAX_BODY_BYTES = 128 * 1024;

export { BackendCapacityError } from "./backend-capacity-error.js";
export { BackendRequestLimiter } from "./backend-request-limiter.js";
export { BackendTimeoutError } from "./backend-timeout-error.js";
export {
  DEFAULT_BACKEND_TIMEOUT_MS,
  MAX_BACKEND_TIMEOUT_MS,
} from "./backend-timeout-limits.js";
export type { ResourceLimit } from "./resource-limit.js";

/** Rejects oversized wire inputs before schemas, filesystem access, or backend
 * work.
 */
export function validateResourceLimits(
  name: string,
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  const limits = [
    requestLimit(arguments_),
    queryLimit(name, arguments_),
    filterLimit(arguments_),
    candidateLimit(name, arguments_),
    bodyLimit(name, arguments_),
  ];
  return limits.find((limit): limit is ResourceLimit => limit !== undefined);
}

function requestLimit(
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  const actual = Buffer.byteLength(JSON.stringify(arguments_), "utf8");
  if (actual > MAX_REQUEST_BYTES)
    return { field: "request", limit: MAX_REQUEST_BYTES, actual };
}

function queryLimit(
  name: string,
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  if (name !== "code_search" || typeof arguments_.query !== "string") return;
  const actual = Array.from(arguments_.query).length;
  if (actual > MAX_QUERY_CODE_POINTS)
    return { field: "query", limit: MAX_QUERY_CODE_POINTS, actual };
}

function candidateLimit(
  name: string,
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  if (name !== "code_search" && name !== "code_follow") return;
  if (
    typeof arguments_.limit !== "number" ||
    arguments_.limit <= MAX_CANDIDATES
  )
    return;
  return { field: "limit", limit: MAX_CANDIDATES, actual: arguments_.limit };
}

function bodyLimit(
  name: string,
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  if (name !== "code_focus") return;
  if (
    typeof arguments_.body_limit_bytes !== "number" ||
    arguments_.body_limit_bytes <= MAX_BODY_BYTES
  )
    return;
  return {
    field: "body_limit_bytes",
    limit: MAX_BODY_BYTES,
    actual: arguments_.body_limit_bytes,
  };
}
