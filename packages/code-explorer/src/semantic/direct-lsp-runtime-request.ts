import { DirectLspError } from "./direct-lsp-error.js";
import { boundedTimeout } from "./direct-lsp-protocol.js";
import type { RestartProcess } from "./direct-lsp-restart-process.js";
import { failWithRestart } from "./direct-lsp-runtime-failure.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import { current, send } from "./direct-lsp-runtime-state.js";

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
  const id = input.state.nextId++;
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
    input.state.pending.set(id, { resolve, reject, timer });
    send(
      input.state,
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
      current(input.state, input.expectedEpoch) &&
      input.state.pending.delete(input.id)
    )
  )
    return;
  send(
    input.state,
    {
      jsonrpc: "2.0",
      method: "$/cancelRequest",
      params: { id: input.id },
    },
    input.expectedEpoch,
  );
  input.reject(new DirectLspError("backend_timeout"));
  trimTimeouts(input.state);
  const timeoutCount = recordTimeout(input.state);
  if (timeoutCount >= 2) failAfterTimeout(input);
}

function recordTimeout(state: DirectLspRuntimeState): number {
  state.timeoutTimes.push(state.scheduler.now());
  return state.timeoutTimes.length;
}

function failAfterTimeout(
  input: Pick<TimeoutInput, "state" | "expectedEpoch" | "onRestart">,
): void {
  failWithRestart(input);
}

function trimTimeouts(state: DirectLspRuntimeState): void {
  const cutoff = state.scheduler.now() - 60_000;
  state.timeoutTimes = state.timeoutTimes.filter((time) => time >= cutoff);
}
