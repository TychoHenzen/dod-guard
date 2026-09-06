import {
  bodyLength,
  concatBytes,
  decodeBody,
  decodeHeader,
} from "./direct-lsp-frame-parser.js";
import {
  CRLFCRLF,
  contains,
  indexOf,
  LF_LF,
  MAX_BODY_BYTES,
} from "./direct-lsp-protocol.js";
import type { RestartProcess } from "./direct-lsp-restart-process.js";
import { handleMessage } from "./direct-lsp-runtime-message.js";
import { protocolFailure } from "./direct-lsp-runtime-protocol-failure.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import { current } from "./direct-lsp-runtime-state.js";

export function handleStdout(input: {
  state: DirectLspRuntimeState;
  chunk: Uint8Array;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): void {
  if (!frameStreamActive(input.state, input.expectedEpoch)) return;
  input.state.bytes = concatBytes(input.state.bytes, input.chunk);
  while (input.state.bytes.length && consumeFrame(input)) {
    // Continue while a complete frame remains in the buffer.
  }
}

type FrameInput = {
  state: DirectLspRuntimeState;
  expectedEpoch: number;
  onRestart?: RestartProcess;
};

function frameStreamActive(
  state: DirectLspRuntimeState,
  epoch: number,
): boolean {
  return (
    current(state, epoch) &&
    !state.stopped &&
    state.state !== "failed" &&
    state.state !== "unavailable"
  );
}

function consumeFrame(input: FrameInput): boolean {
  const frame = parseFrame(input);
  if (frame.status === "incomplete") return false;
  if (frame.status === "invalid") {
    protocolFailure(input);
    return false;
  }
  input.state.bytes = input.state.bytes.slice(frame.end);
  handleMessage({ ...input, message: frame.value });
  return input.state.bytes.length > 0;
}

function parseFrame(
  input: FrameInput,
):
  | { status: "incomplete" }
  | { status: "invalid" }
  | { status: "complete"; end: number; value: unknown } {
  const boundary = indexOf(input.state.bytes, CRLFCRLF);
  if (boundary < 0) return incompleteHeader(input);
  const headerBytes = input.state.bytes.slice(0, boundary);
  const header = decodeHeader(headerBytes);
  if (!header) return { status: "invalid" };
  const length = bodyLength(header);
  if (length === undefined || length > MAX_BODY_BYTES)
    return { status: "invalid" };
  const end = boundary + 4 + length;
  if (input.state.bytes.length < end) return { status: "incomplete" };
  const value = decodeBody(input.state.bytes.slice(boundary + 4, end));
  return value === undefined
    ? { status: "invalid" }
    : { status: "complete", end, value };
}

function incompleteHeader(
  input: FrameInput,
): { status: "incomplete" } | { status: "invalid" } {
  if (input.state.bytes.length > 8_192 || contains(input.state.bytes, LF_LF)) {
    return { status: "invalid" };
  }
  return { status: "incomplete" };
}
