import type { LanguageAdapter } from "../../../semantic/api/public-api.js";

const readyCapabilities = {
  definition: { state: "ready" },
  references: { state: "ready" },
  type_definition: { state: "ready" },
  implementation: { state: "ready" },
  callers: { state: "ready" },
  callees: { state: "ready" },
} as const;

export function readyAdapterStatus(options: {
  name: string;
  version: string;
  capabilities?: Record<string, unknown>;
}): ReturnType<LanguageAdapter["status"]> {
  return {
    language: "rust",
    backend_name: options.name,
    backend_version: options.version,
    discovery_source: "injected",
    state: "ready",
    capabilities: { ...readyCapabilities, ...options.capabilities },
    last_transition_time: 0,
  };
}
