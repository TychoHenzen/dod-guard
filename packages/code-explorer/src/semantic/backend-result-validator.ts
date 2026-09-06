import { Buffer } from "node:buffer";
import {
  projectLocationsIn,
  symbolsIn,
  validateLocation,
  validateSymbol,
} from "./backend-result-locations.js";
import {
  containsStaleRevision,
  containsUnexpectedLanguage,
  containsVirtualDocument,
} from "./backend-result-safety.js";
import type { BackendResultValidation } from "./backend-result-validation.js";
import type * as validation from "./backend-result-validation-options.js";
import { parseSemanticResult, type SemanticResult } from "./contract.js";

const MAX_BACKEND_PAYLOAD_BYTES = 1024 * 1024;

export type { BackendResultValidation } from "./backend-result-validation.js";
export type BackendResultValidationOptions =
  validation.BackendResultValidationOptions;

/** Validates an entire backend response before it can enter cached state. */
export function validateBackendResult(
  input: unknown,
  options: validation.BackendResultValidationOptions,
): BackendResultValidation {
  const safety = validateSafety(input, options);
  if (safety) return safety;
  const result = parseResult(input);
  if (!result)
    return {
      status: "rejected",
      code: "invalid_backend_result",
    };
  return validateParsedResult(result, options);
}

function validateSafety(
  input: unknown,
  options: validation.BackendResultValidationOptions,
): BackendResultValidation | undefined {
  if (payloadSize(input) > MAX_BACKEND_PAYLOAD_BYTES)
    return {
      status: "rejected",
      code: "backend_response_limit",
    };
  if (
    containsVirtualDocument(input) ||
    containsStaleRevision(input, options.currentGeneration)
  )
    return {
      status: "unavailable",
      code: "invalid_backend_result",
      adapter_state: "degraded",
    };
  if (containsUnexpectedLanguage(input, options.allowedLanguages))
    return {
      status: "rejected",
      code: "invalid_backend_result",
      adapter_gap: "unexpected_language",
    };
  return undefined;
}

function parseResult(input: unknown): SemanticResult | undefined {
  try {
    return parseSemanticResult(input);
  } catch {
    return undefined;
  }
}

function validateParsedResult(
  result: SemanticResult,
  options: validation.BackendResultValidationOptions,
): BackendResultValidation {
  try {
    for (const symbol of symbolsIn(result)) validateSymbol(symbol, options);
    for (const location of projectLocationsIn(result))
      validateLocation(location, options);
    return { status: "accepted", result };
  } catch {
    return {
      status: "rejected",
      code: "invalid_backend_result",
    };
  }
}

function payloadSize(input: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(input), "utf8");
  } catch {
    return MAX_BACKEND_PAYLOAD_BYTES + 1;
  }
}
