const MAX_BODY_BYTES = 1024 * 1024;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const RESTART_WINDOW_MS = 60_000;
const RESTART_DELAYS_MS = [250, 1_000] as const;
const PERMITTED_NOTIFICATIONS = new Set([
  "window/logMessage",
  "window/showMessage",
  "telemetry/event",
  "$/progress",
  "textDocument/publishDiagnostics",
]);
const READ_ONLY_METHODS = new Set([
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

export type LspProcess = {
  write(chunk: Uint8Array): void;
  onStdout(listener: (chunk: Uint8Array) => void): void;
  onExit(listener: () => void): void;
  onError?(listener: () => void): void;
  kill(): void;
};
export type DirectLspScheduler = {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};
export type DirectLspOptions = {
  language?: "rust" | "python" | "csharp";
  root_uri: string;
  capabilities: Record<string, unknown>;
  safe_initialization_options: Record<string, unknown>;
  request_timeout_ms?: number;
  scheduler?: DirectLspScheduler;
  restart?: () => LspProcess | undefined;
  afterInitialize?: () => { status: "ready" } | { status: "unavailable"; code: string };
};
export type DirectLspStatus = {
  state: "initializing" | "ready" | "failed" | "unavailable";
  events: readonly ("backend_capability_rejected" | "backend_write_rejected" | "backend_notification")[];
  restart_delays_ms: readonly number[];
  server_capabilities?: Readonly<Record<string, unknown>>;
};
export type ProtectedDocumentContent = Readonly<{ language_id: "rust" | "python" | "csharp"; bytes: string }>;
export class DirectLspError extends Error {
  constructor(
    readonly code:
      | "backend_timeout"
      | "backend_crashed"
      | "backend_failed"
      | "backend_write_rejected"
      | "backend_content_modified",
  ) {
    super(code);
  }
}
type Pending = { resolve(value: unknown): void; reject(reason: DirectLspError): void; timer: unknown };
const defaultScheduler: DirectLspScheduler = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** A read-only LSP transport. Process creation remains outside this boundary. */
export function createDirectLspClient(options: DirectLspOptions) {
  const scheduler = options.scheduler ?? defaultScheduler;
  const capabilities = deepFreeze(clone(options.capabilities));
  const initializationOptions = deepFreeze(clone(options.safe_initialization_options));
  const timeoutMs = boundedTimeout(options.request_timeout_ms ?? 10_000);
  let process: LspProcess | undefined;
  let epoch = 0;
  let state: DirectLspStatus["state"] = "initializing";
  let nextId = 1;
  let bytes = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;
  let stopping = false;
  let stopped = false;
  let crashTimes: number[] = [];
  let timeoutTimes: number[] = [];
  let exitResolver: (() => void) | undefined;
  const pending = new Map<number, Pending>();
  const events: DirectLspStatus["events"][number][] = [];
  const restartDelays: number[] = [];
  let openedDocumentUris = new Set<string>();
  let serverCapabilities: Record<string, unknown> | undefined;
  const current = (candidate: number) => candidate === epoch;
  const send = (message: Record<string, unknown>, expectedEpoch = epoch) => {
    if (process && current(expectedEpoch)) process.write(encodeMessage(message));
  };
  const rejectInflight = (code: DirectLspError["code"]) => {
    for (const entry of pending.values()) {
      scheduler.clearTimeout(entry.timer);
      entry.reject(new DirectLspError(code));
    }
    pending.clear();
  };
  const recordRestart = () => {
    crashTimes = crashTimes.filter((time) => time >= scheduler.now() - RESTART_WINDOW_MS);
    crashTimes.push(scheduler.now());
    if (crashTimes.length > RESTART_DELAYS_MS.length) {
      state = "unavailable";
      return;
    }
    const delay = RESTART_DELAYS_MS[crashTimes.length - 1];
    restartDelays.push(delay);
    scheduler.setTimeout(() => {
      const replacement = options.restart?.();
      if (replacement) void start(replacement).catch(() => undefined);
    }, delay);
  };
  const fail = (code: DirectLspError["code"], restart: boolean, expectedEpoch = epoch) => {
    if (!current(expectedEpoch) || state === "failed" || state === "unavailable") return;
    state = "failed";
    rejectInflight(code);
    process?.kill();
    if (restart) recordRestart();
  };
  const sendRequest = (method: string, params: unknown, timeout: number, expectedEpoch = epoch): Promise<unknown> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = scheduler.setTimeout(() => {
        if (!(current(expectedEpoch) && pending.delete(id))) return;
        send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } }, expectedEpoch);
        reject(new DirectLspError("backend_timeout"));
        timeoutTimes = timeoutTimes.filter((time) => time >= scheduler.now() - RESTART_WINDOW_MS);
        timeoutTimes.push(scheduler.now());
        if (timeoutTimes.length >= 2) fail("backend_crashed", true, expectedEpoch);
      }, boundedTimeout(timeout));
      pending.set(id, { resolve, reject, timer });
      send({ jsonrpc: "2.0", id, method, params }, expectedEpoch);
    });
  };
  const handleMessage = (message: unknown, expectedEpoch: number) => {
    if (!current(expectedEpoch) || stopped || state === "failed" || state === "unavailable") return;
    if (!isRpcMessage(message)) return fail("backend_failed", false, expectedEpoch);
    if ("id" in message && "method" in message && typeof message.method === "string") {
      if (!isRequestId(message.id)) return fail("backend_failed", false, expectedEpoch);
      if (message.method === "client/registerCapability") events.push("backend_capability_rejected");
      if (message.method === "workspace/applyEdit") events.push("backend_write_rejected");
      if (message.method === "workspace/configuration" && options.language === "python") {
        const items = (message.params as { items?: Array<{ section?: string }> } | undefined)?.items ?? [];
        send(
          { jsonrpc: "2.0", id: message.id, result: items.map((item) => pythonConfiguration(item.section)) },
          expectedEpoch,
        );
        return;
      }
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }, expectedEpoch);
      return;
    }
    if ("method" in message && typeof message.method === "string") {
      if (!PERMITTED_NOTIFICATIONS.has(message.method)) return fail("backend_failed", false, expectedEpoch);
      events.push("backend_notification");
      return;
    }
    if (!("id" in message && isPositiveSafeInteger(message.id)) || "result" in message === "error" in message)
      return fail("backend_failed", false, expectedEpoch);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    scheduler.clearTimeout(entry.timer);
    if ("error" in message) {
      const errorCode = (message.error as { code?: unknown } | undefined)?.code;
      entry.reject(new DirectLspError(errorCode === -32801 ? "backend_content_modified" : "backend_failed"));
    } else entry.resolve(message.result);
  };
  const handleStdout = (chunk: Uint8Array, expectedEpoch: number) => {
    if (!current(expectedEpoch) || stopped || state === "failed" || state === "unavailable") return;
    bytes = concat(bytes, chunk);
    while (bytes.length) {
      const boundary = indexOf(bytes, CRLFCRLF);
      if (boundary < 0) {
        if (bytes.length > 8_192 || contains(bytes, LF_LF)) fail("backend_failed", false, expectedEpoch);
        return;
      }
      const headerBytes = bytes.slice(0, boundary);
      if (headerBytes.some((value) => value > 127)) return fail("backend_failed", false, expectedEpoch);
      const header = new TextDecoder("ascii", { fatal: true }).decode(headerBytes);
      if (!/^Content-Length: [0-9]+$/.test(header)) return fail("backend_failed", false, expectedEpoch);
      const length = Number(header.slice("Content-Length: ".length));
      if (!Number.isSafeInteger(length) || length > MAX_BODY_BYTES) return fail("backend_failed", false, expectedEpoch);
      const end = boundary + 4 + length;
      if (bytes.length < end) return;
      let value: unknown;
      try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(boundary + 4, end)));
      } catch {
        return fail("backend_failed", false, expectedEpoch);
      }
      bytes = bytes.slice(end);
      handleMessage(value, expectedEpoch);
    }
  };
  const start = async (nextProcess: LspProcess): Promise<void> => {
    process = nextProcess;
    const expectedEpoch = ++epoch;
    bytes = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;
    openedDocumentUris = new Set<string>();
    stopping = false;
    stopped = false;
    state = "initializing";
    nextProcess.onStdout((chunk) => handleStdout(chunk, expectedEpoch));
    nextProcess.onExit(() => {
      if (!current(expectedEpoch)) return;
      stopped = true;
      exitResolver?.();
      if (bytes.length) {
        fail("backend_failed", false, expectedEpoch);
        return;
      }
      if (stopping) {
        state = "failed";
        return;
      }
      if (!stopping) fail("backend_crashed", true, expectedEpoch);
    });
    nextProcess.onError?.(() => fail("backend_crashed", true, expectedEpoch));
    try {
      const result = await sendRequest(
        "initialize",
        { processId: null, rootUri: options.root_uri, capabilities, initializationOptions },
        timeoutMs,
        expectedEpoch,
      );
      if (!(current(expectedEpoch) && isInitializeResult(result))) throw new DirectLspError("backend_failed");
      serverCapabilities = result.capabilities;
      const confirmation = options.afterInitialize?.();
      if (confirmation?.status === "unavailable") {
        state = "unavailable";
        process?.kill();
        throw new Error(confirmation.code);
      }
      send({ jsonrpc: "2.0", method: "initialized", params: {} }, expectedEpoch);
      state = "ready";
    } catch (error) {
      fail(error instanceof DirectLspError ? error.code : "backend_failed", true, expectedEpoch);
      throw error;
    }
  };
  const request = async (method: string, params: unknown): Promise<unknown> => {
    if (!READ_ONLY_METHODS.has(method)) return Promise.reject(new DirectLspError("backend_write_rejected"));
    if (state !== "ready")
      return Promise.reject(new DirectLspError(state === "unavailable" ? "backend_crashed" : "backend_failed"));
    try {
      return await sendRequest(method, params, timeoutMs);
    } catch (error) {
      if (!(error instanceof DirectLspError && error.code === "backend_content_modified")) throw error;
      try {
        return await sendRequest(method, params, timeoutMs);
      } catch (retryError) {
        if (retryError instanceof DirectLspError && retryError.code === "backend_content_modified")
          throw new DirectLspError("backend_failed");
        throw retryError;
      }
    }
  };
  const openProtectedDocument = (uri: string, content: ProtectedDocumentContent): void => {
    if (state !== "ready") throw new DirectLspError(state === "unavailable" ? "backend_crashed" : "backend_failed");
    if (!isProtectedFileUri(uri, options.root_uri) || typeof content.bytes !== "string")
      throw new DirectLspError("backend_write_rejected");
    if (openedDocumentUris.has(uri)) return;
    send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: { textDocument: { uri, languageId: content.language_id, version: 0, text: content.bytes } },
    });
    openedDocumentUris.add(uri);
  };
  const shutdown = async (): Promise<void> => {
    if (!process || state === "unavailable") return;
    const expectedEpoch = epoch;
    stopping = true;
    try {
      await sendRequest("shutdown", null, SHUTDOWN_TIMEOUT_MS, expectedEpoch);
    } catch {
      /* exit is still required */
    }
    if (!current(expectedEpoch)) return;
    const exited = new Promise<void>((resolve) => {
      exitResolver = resolve;
    });
    send({ jsonrpc: "2.0", method: "exit", params: {} }, expectedEpoch);
    const timeout = scheduler.setTimeout(() => {
      if (!stopped && current(expectedEpoch)) {
        stopping = false;
        fail("backend_crashed", true, expectedEpoch);
      }
      exitResolver?.();
    }, SHUTDOWN_TIMEOUT_MS);
    await exited;
    scheduler.clearTimeout(timeout);
    exitResolver = undefined;
  };
  return {
    start,
    request,
    openProtectedDocument,
    shutdown,
    refresh: () => {
      crashTimes = [];
      timeoutTimes = [];
      if (state === "unavailable") state = "initializing";
    },
    status: (): DirectLspStatus => ({
      state,
      events: [...events],
      restart_delays_ms: [...restartDelays],
      ...(serverCapabilities ? { server_capabilities: deepFreeze(clone(serverCapabilities)) } : {}),
    }),
  };
}

function isProtectedFileUri(uri: string, rootUri: string): boolean {
  try {
    const document = new URL(uri);
    const root = new URL(rootUri);
    const rootPath = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`;
    return (
      document.protocol === "file:" && !document.search && !document.hash && document.pathname.startsWith(rootPath)
    );
  } catch {
    return false;
  }
}

function pythonConfiguration(section: string | undefined): unknown {
  return ["python.pythonPath", "python.venvPath", "python.analysis.extraPaths"].includes(section ?? "") ? [] : null;
}

const CRLFCRLF = new Uint8Array([13, 10, 13, 10]);
const LF_LF = new Uint8Array([10, 10]);
function encodeMessage(message: Record<string, unknown>): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  return concat(new TextEncoder().encode(`Content-Length: ${body.byteLength}\r\n\r\n`), body);
}
function isRpcMessage(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && (value as { jsonrpc?: unknown }).jsonrpc === "2.0";
}
function isInitializeResult(value: unknown): value is { capabilities: Record<string, unknown> } {
  return (
    !!value &&
    typeof value === "object" &&
    !!(value as { capabilities?: unknown }).capabilities &&
    typeof (value as { capabilities: unknown }).capabilities === "object" &&
    !Array.isArray((value as { capabilities: unknown }).capabilities)
  );
}
function isRequestId(value: unknown): value is string | number {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}
function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
}
function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  for (let index = 0; index <= haystack.length - needle.length; index++)
    if (needle.every((value, offset) => haystack[index + offset] === value)) return index;
  return -1;
}
function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  return indexOf(haystack, needle) >= 0;
}
function boundedTimeout(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), SHUTDOWN_TIMEOUT_MS) : SHUTDOWN_TIMEOUT_MS;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
