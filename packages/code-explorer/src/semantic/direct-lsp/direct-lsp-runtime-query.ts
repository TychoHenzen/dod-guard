import { DirectLspError } from "./direct-lsp-error.js";
import { READ_ONLY_METHODS } from "./direct-lsp-protocol.js";
import type { RestartProcess } from "./direct-lsp-restart-process.js";
import { sendRequest } from "./direct-lsp-runtime-request.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";

export async function requestBackend(input: {
  state: DirectLspRuntimeState;
  method: string;
  params: unknown;
  onRestart?: RestartProcess;
}): Promise<unknown> {
  if (!READ_ONLY_METHODS.has(input.method))
    throw new DirectLspError("backend_write_rejected");
  if (input.state.state !== "ready")
    throw new DirectLspError(
      input.state.state === "unavailable"
        ? "backend_crashed"
        : "backend_failed",
    );
  return requestWithRetry(input, false);
}

async function requestWithRetry(
  input: {
    state: DirectLspRuntimeState;
    method: string;
    params: unknown;
    onRestart?: RestartProcess;
  },
  retried: boolean,
): Promise<unknown> {
  try {
    return await sendRequest({
      ...input,
      timeout: input.state.timeoutMs,
    });
  } catch (error) {
    if (
      !(error instanceof DirectLspError) ||
      error.code !== "backend_content_modified"
    )
      throw error;
    if (retried) throw new DirectLspError("backend_failed");
    return requestWithRetry(input, true);
  }
}
