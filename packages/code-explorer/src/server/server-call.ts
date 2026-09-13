import type { CodeExplorerError } from "../navigation/error.js";
import type { CodeExplorerEnvelope } from "./envelope.js";
import { executeValidatedCall } from "./server-call-execution.js";
import { validateServerCall } from "./server-call-validation.js";
import type { ServerRuntime } from "./server-runtime.js";

async function handleServerCall(
  runtime: ServerRuntime,
  name: string,
  arguments_: Record<string, unknown>,
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  const parsed = validateServerCall(name, arguments_);
  if (!parsed.ok) return parsed.error;
  return executeValidatedCall(runtime, parsed.name, parsed.arguments_);
}

export function createServerCall(runtime: ServerRuntime) {
  return (name: string, arguments_: Record<string, unknown>) =>
    handleServerCall(runtime, name, arguments_);
}
