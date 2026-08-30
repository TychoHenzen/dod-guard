import {
  type BackendStatus,
  type Language,
  parseSemanticRequest,
  parseSemanticResult,
  type RelationCapabilities,
  relationNames,
  type SemanticRequest,
  type SemanticResult,
} from "./contract.js";

export type InjectedSemanticBackend = {
  readiness():
    | { state: "initializing" }
    | { state: "ready" }
    | { state: "refreshing" }
    | { state: "unavailable" }
    | { state: "failed"; failure_code: string };
  query(request: SemanticRequest): Promise<SemanticResult>;
};

export type LanguageAdapterOptions = {
  backend: InjectedSemanticBackend;
  compatible: boolean;
  backend_name?: string;
  backend_version: string;
  capabilities?: Partial<RelationCapabilities>;
  now?: () => number;
};

export type LanguageAdapter = {
  status(): BackendStatus;
  request(request: SemanticRequest): Promise<SemanticResult>;
};

export function createRustAdapter(options: LanguageAdapterOptions): LanguageAdapter {
  return createLanguageAdapter("rust", options);
}

export function createPythonAdapter(options: LanguageAdapterOptions): LanguageAdapter {
  return createLanguageAdapter("python", options);
}

export function createCSharpAdapter(options: LanguageAdapterOptions): LanguageAdapter {
  return createLanguageAdapter("csharp", options);
}

function createLanguageAdapter(language: Language, options: LanguageAdapterOptions): LanguageAdapter {
  const capabilities = createCapabilities(options.capabilities);
  const now = options.now ?? Date.now;
  let initializingSince: number | undefined;
  let lastSignature: string | undefined;
  let lastTransitionTime = now();

  return {
    status: () => {
      const status = createStatus(
        language,
        options,
        capabilities,
        now,
        () => initializingSince,
        (value) => {
          initializingSince = value;
        },
      );
      const signature = `${status.state}:${status.failure_code ?? ""}`;
      if (lastSignature === undefined || signature !== lastSignature) {
        lastSignature = signature;
        lastTransitionTime = now();
      }
      return { ...status, last_transition_time: lastTransitionTime };
    },
    request: async (request) => parseSemanticResult(await options.backend.query(parseSemanticRequest(request))),
  };
}

function createStatus(
  language: Language,
  options: LanguageAdapterOptions,
  capabilities: RelationCapabilities,
  now: () => number,
  getInitializingSince: () => number | undefined,
  setInitializingSince: (value: number | undefined) => void,
): BackendStatus {
  const backendState = options.backend.readiness();
  const initializingSince = getInitializingSince();
  if (backendState.state === "initializing" && initializingSince === undefined) setInitializingSince(now());
  if (backendState.state !== "initializing") setInitializingSince(undefined);
  const timedOut = backendState.state === "initializing" && now() - (initializingSince ?? now()) >= 30_000;
  const failed = backendState.state === "failed" || timedOut;
  const state = !options.compatible
    ? "unavailable"
    : timedOut
      ? "failed"
      : backendState.state === "ready" && hasUnavailableCapability(capabilities)
        ? "degraded"
        : backendState.state;
  const effectiveCapabilities =
    state === "unavailable" || state === "failed" ? unavailableCapabilities(capabilities) : capabilities;
  return {
    language,
    backend_name: options.backend_name ?? defaultBackendName(language),
    backend_version: options.backend_version,
    discovery_source: "injected",
    state,
    capabilities: effectiveCapabilities,
    last_transition_time: 0,
    ...(!options.compatible
      ? { failure_code: "unsupported_backend_version" }
      : timedOut
        ? { failure_code: "initialization_timeout" }
        : failed && backendState.state === "failed"
          ? { failure_code: backendState.failure_code }
          : {}),
  };
}

function createCapabilities(overrides: Partial<RelationCapabilities> | undefined): RelationCapabilities {
  const defaults = Object.fromEntries(
    relationNames.map((relation) => [relation, { state: "ready" }]),
  ) as RelationCapabilities;
  return { ...defaults, ...overrides };
}

function hasUnavailableCapability(capabilities: RelationCapabilities): boolean {
  return Object.values(capabilities).some(({ state }) => state !== "ready");
}

function unavailableCapabilities(capabilities: RelationCapabilities): RelationCapabilities {
  return Object.fromEntries(
    Object.keys(capabilities).map((relation) => [relation, { state: "unavailable" }]),
  ) as RelationCapabilities;
}

function defaultBackendName(language: Language): string {
  if (language === "rust") return "rust-analyzer";
  if (language === "python") return "pyright-langserver";
  return "roslyn-language-server";
}
