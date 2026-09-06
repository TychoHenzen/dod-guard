import { DirectLspError } from "./direct-lsp-error.js";
import type { LspProcess } from "./direct-lsp-process.js";
import { isPositiveSafeInteger } from "./direct-lsp-protocol.js";
import { protocolFailure } from "./direct-lsp-runtime-protocol-failure.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";

export function handleResponse(
  input: {
    state: DirectLspRuntimeState;
    expectedEpoch: number;
    onRestart?: (process: LspProcess) => Promise<void>;
  },
  message: Record<string, unknown>,
): void {
  if (!isPositiveSafeInteger(message.id)) return protocolFailure(input);
  if ("result" in message === "error" in message) return protocolFailure(input);
  const entry = input.state.pending.get(message.id);
  if (!entry) return;
  input.state.pending.delete(message.id);
  input.state.scheduler.clearTimeout(entry.timer);
  if ("error" in message) return rejectResponse(entry.reject, message.error);
  entry.resolve(message.result);
}

function rejectResponse(
  reject: (reason: DirectLspError) => void,
  error: unknown,
): void {
  const code = (error as { code?: unknown } | undefined)?.code;
  reject(
    new DirectLspError(
      code === -32801 ? "backend_content_modified" : "backend_failed",
    ),
  );
}
