import type {
  DirectLspStatus,
  ProtectedDocumentContent,
} from "../semantic/direct-lsp/direct-lsp.js";

export function semanticClient(
  request: (
    method: string,
    params: unknown,
  ) => unknown | Promise<unknown> = () => [],
  serverCapabilities: Record<string, unknown> = {},
  openProtectedDocument?: (
    uri: string,
    content: ProtectedDocumentContent,
  ) => void,
) {
  return {
    status: () => ({
      state: "ready" as const,
      events: [],
      restart_delays_ms: [],
      server_capabilities: serverCapabilities,
    }),
    request: (method: string, params: unknown) =>
      Promise.resolve(request(method, params)),
    ...(openProtectedDocument ? { openProtectedDocument } : {}),
  };
}

export function defaultClient(): {
  status: () => DirectLspStatus;
  request: (method: string, params: unknown) => Promise<unknown>;
  openProtectedDocument?: (
    uri: string,
    content: ProtectedDocumentContent,
  ) => void;
} {
  return {
    status: () => ({
      state: "ready",
      events: [],
      restart_delays_ms: [],
      server_capabilities: {},
    }),
    request: async () => [],
  };
}
