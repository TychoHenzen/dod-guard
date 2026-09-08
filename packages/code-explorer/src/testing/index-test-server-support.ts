import { createServer } from "../index.js";
import type { LanguageAdapter } from "../semantic/adapters/language-adapter.js";
import { readyCapabilities } from "./direct-lsp-semantic-support.js";
import { unavailableCapabilities } from "./runtime-lsp-test-support.js";
import { testLocation } from "./semantic-test-shapes.js";

export function symbol(kind: string, path: string) {
  return {
    id: `${kind}:${path}`,
    name: "helper",
    language: "rust" as const,
    kind,
    location: testLocation(path, { line: 0, character: 0 }, { line: 0, character: 6 }),
  };
}

export { startSession } from "./index-test-session-support.js";

export async function followDefinition({
  server,
  sessionId,
  viewId,
  handle,
}: {
  server: ReturnType<typeof createServer>;
  sessionId: string;
  viewId: string;
  handle: string;
}) {
  return server.call("code_follow", {
    session_id: sessionId,
    request_id: "follow-request-0001",
    view_id: viewId,
    handle,
    relation: "definition",
  });
}

function focusedNavigationResult(focused: ReturnType<typeof symbol>) {
  return {
    operation: "focus" as const,
    revision: { generation: 1, manifest_sha256: "test" },
    symbol: focused,
    content: { body: "Target", visible_symbols: [{ name: "Target", symbol_id: "target" }] },
  };
}

type TestAdapterStatus = ReturnType<LanguageAdapter["status"]>;

function testAdapterStatus(
  language: TestAdapterStatus["language"],
  capabilities: TestAdapterStatus["capabilities"],
): TestAdapterStatus {
  return {
    language,
    backend_name: "test",
    backend_version: "test",
    discovery_source: "injected",
    state: "ready",
    capabilities,
    last_transition_time: 0,
  };
}

export function focusableNavigationAdapter(): LanguageAdapter {
  const focused = symbol("function", "src/helper.rs");
  return {
    status: () => testAdapterStatus("rust", unavailableCapabilities),
    request: async () => focusedNavigationResult(focused),
  };
}

export function adapterWithSymbols(symbols: ReturnType<typeof symbol>[]): LanguageAdapter {
  return {
    status: () => testAdapterStatus("rust", readyCapabilities()),
    request: async () => ({ operation: "search", revision: { generation: 1, manifest_sha256: "test" }, symbols }),
  };
}

export function unavailableAdapter(): LanguageAdapter {
  const adapter = adapterWithSymbols([]);
  adapter.request = async () => {
    throw new Error("backend_unavailable");
  };
  return adapter;
}

export { assertFileFallback } from "./index-test-discovery-support.js";
