import type { DirectLspStatus } from "./direct-lsp-status.js";
import { clone, deepFreeze } from "./direct-lsp-values.js";

export function isProtectedFileUri(uri: string, rootUri: string): boolean {
  const document = parseFileUri(uri);
  const root = parseFileUri(rootUri);
  if (!document) return false;
  if (!root) return false;
  return isProtectedDocument(document, root);
}

function isProtectedDocument(document: URL, root: URL): boolean {
  if (document.protocol !== "file:") return false;
  if (document.search || document.hash) return false;
  const rootPath = root.pathname.endsWith("/")
    ? root.pathname
    : `${root.pathname}/`;
  return document.pathname.startsWith(rootPath);
}

function parseFileUri(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function statusSnapshot(input: {
  state: DirectLspStatus["state"];
  events: readonly DirectLspStatus["events"][number][];
  restartDelays: readonly number[];
  serverCapabilities: Record<string, unknown> | undefined;
}): DirectLspStatus {
  return {
    state: input.state,
    events: [...input.events],
    restart_delays_ms: [...input.restartDelays],
    ...(input.serverCapabilities
      ? {
          server_capabilities: deepFreeze(clone(input.serverCapabilities)),
        }
      : {}),
  };
}
