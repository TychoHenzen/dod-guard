import type { LspProcess } from "../semantic/direct-lsp/direct-lsp.js";
import type { RuntimeLspBackendOptions } from "../semantic/runtime/runtime-lsp-backend.js";
import { runtimeRoot, unavailableCapabilities, readyPreparation } from "./runtime-lsp-test-fixtures.js";

export function runtimeOptions(
  process: LspProcess,
  overrides: Partial<RuntimeLspBackendOptions> = {},
): RuntimeLspBackendOptions {
  return {
    language: "rust",
    root: runtimeRoot,
    root_uri: "file:///project",
    revision: { generation: 0, manifest_sha256: "x" },
    symbols: new Map(),
    capabilities: unavailableCapabilities,
    toBackendUri: () => "file:///project/a.rs",
    fromBackendUri: () => "a.rs",
    prepare: readyPreparation,
    confirmInitialized: () => ({ status: "ready" }),
    spawn: () => process,
    ...overrides,
  };
}

export function policyFailureOptions(onPrepare: () => void) {
  return {
    prepare: () => {
      onPrepare();
      return readyPreparation();
    },
    confirmInitialized: () => ({
      status: "unavailable" as const,
      code: "backend_identity_changed" as const,
      terminate: true as const,
    }),
  };
}
