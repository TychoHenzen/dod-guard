export { clone, deepFreeze } from "./direct-lsp-values.js";
export {
  CRLFCRLF,
  contains,
  encodeMessage,
  indexOf,
  LF_LF,
} from "./direct-lsp-wire.js";

export const MAX_BODY_BYTES = 1024 * 1024;
export const SHUTDOWN_TIMEOUT_MS = 5_000;
export const RESTART_WINDOW_MS = 60_000;
export const RESTART_DELAYS_MS = [250, 1_000] as const;
export const PERMITTED_NOTIFICATIONS = new Set([
  "window/logMessage",
  "window/showMessage",
  "telemetry/event",
  "$/progress",
  "textDocument/publishDiagnostics",
]);
export const READ_ONLY_METHODS = new Set([
  "textDocument/definition",
  "textDocument/references",
  "textDocument/typeDefinition",
  "textDocument/implementation",
  "textDocument/prepareCallHierarchy",
  "callHierarchy/incomingCalls",
  "callHierarchy/outgoingCalls",
  "textDocument/documentSymbol",
  "workspace/symbol",
]);
export function boundedTimeout(value: number): number {
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), SHUTDOWN_TIMEOUT_MS)
    : SHUTDOWN_TIMEOUT_MS;
}

export function isRpcMessage(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { jsonrpc?: unknown }).jsonrpc === "2.0"
  );
}

export function isInitializeResult(
  value: unknown,
): value is { capabilities: Record<string, unknown> } {
  if (!value || typeof value !== "object") return false;
  const capabilities = (value as { capabilities?: unknown }).capabilities;
  return (
    !!capabilities &&
    typeof capabilities === "object" &&
    !Array.isArray(capabilities)
  );
}

export function isRequestId(value: unknown): value is string | number {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function pythonConfiguration(section: string | undefined): unknown {
  return [
    "python.pythonPath",
    "python.venvPath",
    "python.analysis.extraPaths",
  ].includes(section ?? "")
    ? []
    : null;
}
