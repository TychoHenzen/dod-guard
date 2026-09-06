import {
  bodyLength,
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

export function handleStdout(input: {
  state: DirectLspRuntimeState;
  chunk: Uint8Array;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): void {
  if (!frameStreamActive(input.state, input.expectedEpoch)) return;
  input.state.appendBytes(input.chunk);
  while (input.state.bytesLength() && consumeFrame(input)) {
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
    state.current(epoch) &&
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
  input.state.consumeBytes(frame.end);
  handleMessage({ ...input, message: frame.value });
  return input.state.bytesLength() > 0;
}

function parseFrame(
  input: FrameInput,
):
  | { status: "incomplete" }
  | { status: "invalid" }
  | { status: "complete"; end: number; value: unknown } {
  const boundary = indexOf(input.state.bytesSlice(), CRLFCRLF);
  if (boundary < 0) return incompleteHeader(input);
  const headerBytes = input.state.bytesSlice(0, boundary);
  const header = decodeHeader(headerBytes);
  if (!header) return { status: "invalid" };
  const length = bodyLength(header);
  if (length === undefined || length > MAX_BODY_BYTES)
    return { status: "invalid" };
  const end = boundary + 4 + length;
  if (input.state.bytesLength() < end) return { status: "incomplete" };
  const value = decodeBody(input.state.bytesSlice(boundary + 4, end));
  return value === undefined
    ? { status: "invalid" }
    : { status: "complete", end, value };
}

function incompleteHeader(
  input: FrameInput,
): { status: "incomplete" } | { status: "invalid" } {
  if (
    input.state.bytesLength() > 8_192 ||
    contains(input.state.bytesSlice(), LF_LF)
  ) {
    return { status: "invalid" };
  }
  return { status: "incomplete" };
}
