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
  readiness(): { state: "ready" } | { state: "unavailable" } | { state: "failed"; failure_code: string };
  query(request: SemanticRequest): Promise<SemanticResult>;
};

export type LanguageAdapterOptions = {
  backend: InjectedSemanticBackend;
  compatible: boolean;
  backend_name?: string;
  backend_version: string;
  capabilities?: Partial<RelationCapabilities>;
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

function createLanguageAdapter(language: Language, options: LanguageAdapterOptions): LanguageAdapter {
  const capabilities = createCapabilities(options.capabilities);

  return {
    status: () => createStatus(language, options, capabilities),
    request: async (request) => parseSemanticResult(await options.backend.query(parseSemanticRequest(request))),
  };
}

function createStatus(
  language: Language,
  options: LanguageAdapterOptions,
  capabilities: RelationCapabilities,
): BackendStatus {
  const backendState = options.backend.readiness();
  const state = !options.compatible ? "unavailable" : backendState.state;
  return {
    language,
    backend_name: options.backend_name ?? defaultBackendName(language),
    backend_version: options.backend_version,
    discovery_source: "injected",
    state,
    capabilities,
    ...(!options.compatible
      ? { failure_code: "unsupported_backend_version" }
      : backendState.state === "failed"
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

function defaultBackendName(language: Language): string {
  if (language === "rust") return "rust-analyzer";
  if (language === "python") return "pyright-langserver";
  return "roslyn-language-server";
}
