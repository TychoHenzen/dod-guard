import type { LspProcess } from "./direct-lsp-process.js";
import { isRequestId, pythonConfiguration } from "./direct-lsp-protocol.js";
import { protocolFailure } from "./direct-lsp-runtime-protocol-failure.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import { send } from "./direct-lsp-runtime-state.js";

export function handleServerRequest(
  input: {
    state: DirectLspRuntimeState;
    expectedEpoch: number;
    onRestart?: (process: LspProcess) => Promise<void>;
  },
  message: Record<string, unknown>,
): void {
  if (!isRequestId(message.id)) return protocolFailure(input);
  const method = message.method as string;
  recordRejectedRequest(input.state, method);
  if (isPythonConfiguration(input.state, method))
    return handlePythonConfiguration(input, message);
  send(
    input.state,
    {
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: "Method not found" },
    },
    input.expectedEpoch,
  );
}

function recordRejectedRequest(
  state: DirectLspRuntimeState,
  method: string,
): void {
  const event = rejectedRequestEvent(method);
  if (event) state.events.push(event);
}

function rejectedRequestEvent(
  method: string,
): "backend_capability_rejected" | "backend_write_rejected" | undefined {
  if (method === "client/registerCapability")
    return "backend_capability_rejected";
  if (method === "workspace/applyEdit") return "backend_write_rejected";
  return undefined;
}

function isPythonConfiguration(
  state: DirectLspRuntimeState,
  method: string,
): boolean {
  return (
    method === "workspace/configuration" && state.options.language === "python"
  );
}

function handlePythonConfiguration(
  input: {
    state: DirectLspRuntimeState;
    expectedEpoch: number;
  },
  message: Record<string, unknown>,
): void {
  const params = message.params as
    | { items?: Array<{ section?: string }> }
    | undefined;
  const items = params?.items ?? [];
  send(
    input.state,
    {
      jsonrpc: "2.0",
      id: message.id,
      result: items.map((item) => pythonConfiguration(item.section)),
    },
    input.expectedEpoch,
  );
}
