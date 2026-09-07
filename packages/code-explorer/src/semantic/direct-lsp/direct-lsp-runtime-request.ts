import { DirectLspError } from "./direct-lsp-error.js";
import { boundedTimeout } from "./direct-lsp-protocol.js";
import type { RestartProcess } from "./direct-lsp-restart-process.js";
import { failWithRestart } from "./direct-lsp-runtime-failure.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";

type TimeoutInput = {
  state: DirectLspRuntimeState;
  id: number;
  expectedEpoch: number;
  reject: (reason?: unknown) => void;
  onRestart?: RestartProcess;
};

export function sendRequest(input: {
  state: DirectLspRuntimeState;
  method: string;
  params: unknown;
  timeout: number;
  expectedEpoch?: number;
  onRestart?: RestartProcess;
}): Promise<unknown> {
  const expectedEpoch = input.expectedEpoch ?? input.state.epoch;
  const id = input.state.nextRequestId();
  return registerRequest(input, id, expectedEpoch);
}

function registerRequest(
  input: Parameters<typeof sendRequest>[0],
  id: number,
  expectedEpoch: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = input.state.scheduler.setTimeout(() => {
      onRequestTimeout({
        ...input,
        id,
        expectedEpoch,
        reject,
      });
    }, boundedTimeout(input.timeout));
    input.state.setPending(id, { resolve, reject, timer });
    input.state.send(
      {
        jsonrpc: "2.0",
        id,
        method: input.method,
        params: input.params,
      },
      expectedEpoch,
    );
  });
}

function onRequestTimeout(input: TimeoutInput): void {
  if (
    !(
      input.state.current(input.expectedEpoch) &&
      input.state.deletePending(input.id)
    )
  )
    return;
  input.state.send(
    {
      jsonrpc: "2.0",
      method: "$/cancelRequest",
      params: { id: input.id },
    },
    input.expectedEpoch,
  );
  input.reject(new DirectLspError("backend_timeout"));
  const timeoutCount = recordTimeout(input.state);
  if (timeoutCount >= 2) failAfterTimeout(input);
}

function recordTimeout(state: DirectLspRuntimeState): number {
  return state.recordTimeout();
}

function failAfterTimeout(
  input: Pick<TimeoutInput, "state" | "expectedEpoch" | "onRestart">,
): void {
  failWithRestart(input);
}
