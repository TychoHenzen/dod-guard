import {
  type BackendStatus,
  type Language,
  type RelationCapabilities,
  relationNames,
} from "../contracts/contract.js";
import type { LanguageAdapterOptions } from "./language-adapter-options.js";

export function adapterState(input: {
  options: LanguageAdapterOptions;
  backendState: string;
  timedOut: boolean;
  capabilities: RelationCapabilities;
}): BackendStatus["state"] {
  if (!input.options.compatible) return "unavailable";
  if (input.timedOut) return "failed";
  if (
    input.backendState === "ready" &&
    hasUnavailableCapability(input.capabilities)
  )
    return "degraded";
  return input.backendState as BackendStatus["state"];
}

export function failureFields(input: {
  options: LanguageAdapterOptions;
  backendState: { state: string; failure_code?: string };
  timedOut: boolean;
}): Partial<Pick<BackendStatus, "failure_code">> {
  if (!input.options.compatible)
    return { failure_code: "unsupported_backend_version" };
  if (input.backendState.state === "unavailable")
    return { failure_code: unavailableFailure(input) };
  if (input.timedOut) return { failure_code: "initialization_timeout" };
  if (input.backendState.state === "failed")
    return {
      failure_code: input.backendState.failure_code,
    };
  return {};
}

function unavailableFailure(input: {
  options: LanguageAdapterOptions;
  backendState: { failure_code?: string };
}): string {
  return (
    input.backendState.failure_code ??
    input.options.unavailable_failure_code ??
    "backend_unavailable"
  );
}

export function configuredCapabilities(
  overrides: Partial<RelationCapabilities> | undefined,
): RelationCapabilities {
  const defaults = Object.fromEntries(
    relationNames.map((relation) => [relation, { state: "ready" }]),
  ) as RelationCapabilities;
  return { ...defaults, ...overrides };
}

export function unavailableCapabilities(
  capabilities: RelationCapabilities,
): RelationCapabilities {
  return Object.fromEntries(
    Object.keys(capabilities).map((relation) => [
      relation,
      { state: "unavailable" },
    ]),
  ) as RelationCapabilities;
}

function hasUnavailableCapability(capabilities: RelationCapabilities): boolean {
  return Object.values(capabilities).some(({ state }) => state !== "ready");
}

export function defaultBackendName(language: Language): string {
  if (language === "rust") return "rust-analyzer";
  if (language === "python") return "pyright-langserver";
  return "roslyn-language-server";
}
