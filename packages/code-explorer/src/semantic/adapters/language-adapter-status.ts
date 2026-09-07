import type {
  BackendStatus,
  Language,
  RelationCapabilities,
} from "../contracts/contract.js";
import type { LanguageAdapterOptions } from "./language-adapter-options.js";
import {
  adapterState,
  configuredCapabilities,
  defaultBackendName,
  failureFields,
  unavailableCapabilities,
} from "./language-adapter-status-fields.js";

export { configuredCapabilities } from "./language-adapter-status-fields.js";

export function createBackendStatus(input: {
  language: Language;
  options: LanguageAdapterOptions;
  capabilities: RelationCapabilities;
  now: () => number;
  initializingSince: number | undefined;
}): {
  status: BackendStatus;
  initializingSince: number | undefined;
} {
  const backendState = input.options.backend.readiness();
  const initializingSince = nextInitializingSince(
    backendState.state,
    input.initializingSince,
    input.now,
  );
  const timedOut =
    backendState.state === "initializing" &&
    input.now() - (initializingSince ?? input.now()) >= 30_000;
  const state = adapterState({
    options: input.options,
    backendState: backendState.state,
    timedOut,
    capabilities: input.capabilities,
  });
  const status: BackendStatus = {
    language: input.language,
    backend_name:
      input.options.backend_name ?? defaultBackendName(input.language),
    backend_version: input.options.backend_version,
    discovery_source: input.options.discovery_source ?? "injected",
    state,
    capabilities:
      state === "unavailable" || state === "failed"
        ? unavailableCapabilities(input.capabilities)
        : input.capabilities,
    last_transition_time: 0,
    ...failureFields({
      options: input.options,
      backendState,
      timedOut,
    }),
  };
  return { status, initializingSince };
}

function nextInitializingSince(
  state: string,
  current: number | undefined,
  now: () => number,
): number | undefined {
  if (state === "initializing") return current ?? now();
  return undefined;
}
