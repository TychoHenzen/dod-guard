import type { InjectedSemanticBackend } from "../adapters/language-adapter.js";
import type { RelationName, SymbolIdentity } from "../contracts/contract.js";
import type { DirectLspStatus } from "./direct-lsp.js";
import * as semanticCapabilities from "./direct-lsp-semantic-capabilities.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";
import { createSemanticQuery } from "./direct-lsp-semantic-query.js";

type Readiness = () => ReturnType<InjectedSemanticBackend["readiness"]>;

export function createDirectLspSemanticBackend(
  options: semanticOptions.DirectLspSemanticOptions,
): InjectedSemanticBackend {
  const unavailableRelations = new Set<RelationName>();
  const symbols = new Map(options.symbols);
  return {
    readiness: createReadiness(options, unavailableRelations),
    capabilities: createCapabilities(options, unavailableRelations),
    query: createSemanticQuery({
      options,
      unavailableRelations,
      symbols,
    }),
  };
}

function createReadiness(
  options: semanticOptions.DirectLspSemanticOptions,
  unavailableRelations: Set<RelationName>,
): Readiness {
  return () =>
    unavailableRelations.size > 0 && options.client.status().state === "ready"
      ? { state: "degraded" }
      : readiness(options.client.status());
}

function createCapabilities(
  options: semanticOptions.DirectLspSemanticOptions,
  unavailableRelations: Set<RelationName>,
): NonNullable<InjectedSemanticBackend["capabilities"]> {
  return () => {
    const capabilities =
      semanticCapabilities.relationCapabilitiesFromInitialize(
        options.client.status(),
      );
    for (const relation of unavailableRelations)
      capabilities[relation] = { state: "unavailable" };
    return capabilities;
  };
}

function readiness(
  status: DirectLspStatus,
): ReturnType<InjectedSemanticBackend["readiness"]> {
  return status.state === "failed"
    ? { state: "failed", failure_code: "backend_failed" }
    : { state: status.state };
}
