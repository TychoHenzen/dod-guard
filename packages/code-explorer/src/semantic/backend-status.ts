import type { BackendStatus } from "./contract.js";
import type { LanguageAdapter } from "./language-adapter.js";

export type BackendStatusReport = {
  backends: readonly BackendStatus[];
  navigation: {
    discovery: "semantic" | "discovery_only";
    focus: "ready" | "backend_unavailable";
    relations: "ready" | "backend_unavailable";
  };
};

/**
 * Produces the redacted status payload used by code_status. Each adapter stays
 * independent so one initialization failure cannot hide a ready language.
 */
export function createBackendStatusReport(adapters: readonly LanguageAdapter[]): BackendStatusReport {
  const backends = adapters.map((adapter) => adapter.status());
  const anyReady = backends.some(({ state }) => state === "ready" || state === "degraded" || state === "refreshing");

  return {
    backends,
    navigation: anyReady
      ? { discovery: "semantic", focus: "ready", relations: "ready" }
      : { discovery: "discovery_only", focus: "backend_unavailable", relations: "backend_unavailable" },
  };
}
