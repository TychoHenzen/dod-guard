import { validateBackendResult } from "./backend-result-validator.js";
import type {
  Language,
  ProjectRevision,
  RelationCapabilities,
  RelationName,
  SemanticRequest,
  SemanticResult,
  SymbolIdentity,
} from "./contract.js";
import type { DirectLspStatus, ProtectedDocumentContent } from "./direct-lsp.js";
import type { InjectedSemanticBackend } from "./language-adapter.js";
import type { ProjectRoot } from "./project-root.js";

export type ReadOnlyLspClient = {
  request(method: string, params: unknown): Promise<unknown>;
  openProtectedDocument?(uri: string, content: ProtectedDocumentContent): void;
  status(): DirectLspStatus;
};

export type DirectLspSemanticOptions = {
  language: Language;
  client: ReadOnlyLspClient;
  root: ProjectRoot;
  revision: ProjectRevision;
  symbols: ReadonlyMap<string, SymbolIdentity>;
  capabilities: RelationCapabilities;
  toBackendUri(location: SymbolIdentity["location"]): string;
  fromBackendUri(uri: string): string | undefined;
};

/**
 * Converts only read-only LSP navigation responses into the common semantic
 * contract. A response is retained only after the protected project-root
 * validator has read every returned local location.
 */
export function createDirectLspSemanticBackend(options: DirectLspSemanticOptions): InjectedSemanticBackend {
  const unavailableRelations = new Set<RelationName>();
  return {
    readiness: () =>
      unavailableRelations.size > 0 && options.client.status().state === "ready"
        ? { state: "degraded" }
        : readiness(options.client.status()),
    capabilities: () => {
      const capabilities = relationCapabilitiesFromInitialize(options.client.status());
      for (const relation of unavailableRelations) capabilities[relation] = { state: "unavailable" };
      return capabilities;
    },
    query: async (request) => {
      if (
        request.operation !== "search" &&
        request.operation !== "focus" &&
        unavailableRelations.has(request.operation)
      )
        throw new Error("backend_unavailable");
      const source = request.operation === "search" ? undefined : options.symbols.get(request.symbol_id);
      if (!source && request.operation !== "search") throw new Error("backend_unavailable");
      if (
        isRelation(request) &&
        relationCapabilitiesFromInitialize(options.client.status())[request.operation].state !== "ready"
      )
        throw new Error("backend_unavailable");
      if (source && request.operation !== "focus") openSourceDocument(source, options);
      const raw = await requestLsp(request, source, options);
      let result: SemanticResult;
      try {
        result = normalizeResult(request, raw, source, options);
      } catch (error) {
        if (isRelation(request)) unavailableRelations.add(request.operation);
        throw error;
      }
      const checked = validateBackendResult(result, {
        allowedLanguages: [options.language],
        root: options.root,
        currentGeneration: options.revision.generation,
      });
      if (checked.status !== "accepted") {
        if (isRelation(request)) unavailableRelations.add(request.operation);
        throw new Error(checked.code);
      }
      return checked.result;
    },
  };
}

function openSourceDocument(source: SymbolIdentity, options: DirectLspSemanticOptions): void {
  if (!options.client.openProtectedDocument) return;
  const uri = options.toBackendUri(source.location);
  const document = options.root.protectedRead(source.location.path);
  options.client.openProtectedDocument(uri, { language_id: options.language, bytes: document.bytes });
}

function isRelation(request: SemanticRequest): request is SemanticRequest & { operation: RelationName } {
  return request.operation !== "search" && request.operation !== "focus";
}

/** Converts initialize capabilities into the shared relation capability shape. */
export function relationCapabilitiesFromInitialize(status: DirectLspStatus): RelationCapabilities {
  const capabilities = status.server_capabilities ?? {};
  const supported = (name: string) => capabilities[name] !== undefined && capabilities[name] !== false;
  return {
    definition: supported("definitionProvider") ? { state: "ready" } : { state: "unavailable" },
    references: supported("referencesProvider") ? { state: "ready" } : { state: "unavailable" },
    type_definition: supported("typeDefinitionProvider") ? { state: "ready" } : { state: "unavailable" },
    implementation: supported("implementationProvider") ? { state: "ready" } : { state: "unavailable" },
    callers: supported("callHierarchyProvider") ? { state: "ready" } : { state: "unavailable" },
    callees: supported("callHierarchyProvider") ? { state: "ready" } : { state: "unavailable" },
  };
}

async function requestLsp(
  request: SemanticRequest,
  source: SymbolIdentity | undefined,
  options: DirectLspSemanticOptions,
) {
  if (request.operation !== "callers" && request.operation !== "callees")
    return options.client.request(methodFor(request.operation), paramsFor(request, source, options));
  if (!source) throw new Error("backend_unavailable");
  const prepared = await options.client.request(
    "textDocument/prepareCallHierarchy",
    paramsFor(request, source, options),
  );
  const item = Array.isArray(prepared) ? prepared[0] : prepared;
  if (!item || typeof item !== "object") return [];
  return options.client.request(
    request.operation === "callers" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls",
    { item },
  );
}

function readiness(status: DirectLspStatus): ReturnType<InjectedSemanticBackend["readiness"]> {
  return status.state === "failed" ? { state: "failed", failure_code: "backend_failed" } : { state: status.state };
}

function methodFor(operation: SemanticRequest["operation"]): string {
  if (operation === "definition") return "textDocument/definition";
  if (operation === "references") return "textDocument/references";
  if (operation === "type_definition") return "textDocument/typeDefinition";
  if (operation === "implementation") return "textDocument/implementation";
  if (operation === "callers" || operation === "callees") return "textDocument/prepareCallHierarchy";
  return "workspace/symbol";
}

function paramsFor(
  request: SemanticRequest,
  source: SymbolIdentity | undefined,
  options: DirectLspSemanticOptions,
): Record<string, unknown> {
  if (request.operation === "search") return { query: request.query };
  if (!source) throw new Error("backend_unavailable");
  const textDocument = { uri: options.toBackendUri(source.location) };
  const position = source.location.range.start;
  if (request.operation === "references") return { textDocument, position, context: { includeDeclaration: true } };
  return { textDocument, position };
}

function normalizeResult(
  request: SemanticRequest,
  raw: unknown,
  source: SymbolIdentity | undefined,
  options: DirectLspSemanticOptions,
): SemanticResult {
  if (request.operation === "search") {
    return {
      operation: "search",
      revision: options.revision,
      symbols: workspaceSymbols(raw, options),
    };
  }
  if (request.operation === "focus") {
    if (!source) throw new Error("backend_unavailable");
    return { operation: "focus", revision: options.revision, symbol: source };
  }
  const capability = relationCapabilitiesFromInitialize(options.client.status())[request.operation];
  if (capability.state !== "ready") throw new Error("backend_unavailable");
  const relation = request.operation as RelationName;
  if (relation === "callers" || relation === "callees") {
    return {
      operation: relation,
      revision: options.revision,
      relations: hierarchyRelations(raw, relation, source, options),
    };
  }
  return {
    operation: relation,
    revision: options.revision,
    relations: locations(raw, options).map((location, index) => {
      if ("external" in location) {
        return { relation, external: { external: true } };
      }
      const symbol = symbolFor(location, index, options);
      return { relation, symbol, location: symbol.location };
    }),
  };
}

/** Keeps the public workspace/symbol name and SymbolKind as discovery evidence. */
function workspaceSymbols(raw: unknown, options: DirectLspSemanticOptions): SymbolIdentity[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.flatMap((value, index): SymbolIdentity[] => {
    const item = value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
    const location = lspLocation(
      item?.location && typeof item.location === "object" ? (item.location as Record<string, unknown>) : item,
      options,
    );
    if (!(location && !("external" in location))) return [];
    return [
      {
        id: `${options.language}:${location.path}:${index}`,
        name: typeof item?.name === "string" ? item.name : location.path,
        language: options.language,
        kind: workspaceSymbolKind(item?.kind),
        location,
      },
    ];
  });
}

function workspaceSymbolKind(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value.toLocaleLowerCase("en-US");
  const kinds: Record<number, string> = { 5: "class", 6: "method", 12: "function" };
  return typeof value === "number" && kinds[value] ? kinds[value] : "symbol";
}

function hierarchyRelations(
  raw: unknown,
  relation: "callers" | "callees",
  source: SymbolIdentity | undefined,
  options: DirectLspSemanticOptions,
): Array<{
  relation: RelationName;
  symbol: SymbolIdentity;
  location: SymbolIdentity["location"] | { external: true };
}> {
  const values = Array.isArray(raw) ? raw : [];
  return values.flatMap((value, index): Array<any> => {
    const entry = value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
    const target = entry?.[relation === "callers" ? "from" : "to"];
    const targetRecord = target && typeof target === "object" ? (target as Record<string, unknown>) : undefined;
    const location = lspLocation(targetRecord, options);
    const callSiteUri = relation === "callees" && source ? options.toBackendUri(source.location) : targetRecord?.uri;
    const callSite = Array.isArray(entry?.fromRanges)
      ? lspLocation({ uri: callSiteUri, range: entry?.fromRanges[0] }, options)
      : location;
    if (!(location && callSite)) return [];
    if ("external" in location) {
      return [{ relation, external: { external: true } }];
    }
    return [
      {
        relation,
        symbol: {
          id: `${options.language}:${location.path}:${index}`,
          name: typeof targetRecord?.name === "string" ? targetRecord.name : location.path,
          language: options.language,
          kind: String(targetRecord?.kind ?? "symbol"),
          location,
        },
        location: "external" in callSite ? { external: true } : callSite,
      },
    ];
  });
}

function lspLocation(
  target: Record<string, unknown> | undefined,
  options: DirectLspSemanticOptions,
): SymbolIdentity["location"] | { external: true } | undefined {
  const uri = target?.uri ?? target?.targetUri;
  const range = target?.range ?? target?.targetRange;
  if (!(typeof uri === "string" && validRange(range))) return undefined;
  const path = options.fromBackendUri(uri);
  if (path) return { path, range: range as SymbolIdentity["location"]["range"] };
  if (uri.startsWith("file:")) return { external: true };
  throw new Error("invalid_backend_result");
}

function locations(
  raw: unknown,
  options: DirectLspSemanticOptions,
): Array<SymbolIdentity["location"] | { external: true }> {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const result: Array<SymbolIdentity["location"] | { external: true }> = [];
  for (const value of values) {
    const item = value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
    const hierarchy = item?.from ?? item?.to;
    const target =
      hierarchy && typeof hierarchy === "object"
        ? (hierarchy as Record<string, unknown>)
        : item?.targetUri
          ? item
          : item?.location && typeof item.location === "object"
            ? (item.location as Record<string, unknown>)
            : item;
    const uri = target?.uri ?? target?.targetUri;
    const range = target?.range ?? target?.targetRange;
    const path = typeof uri === "string" ? options.fromBackendUri(uri) : undefined;
    if (!validRange(range)) continue;
    const externalFile = typeof uri === "string" && uri.startsWith("file:");
    if (!(path || externalFile)) throw new Error("invalid_backend_result");
    if (!path) result.push({ external: true });
    else result.push({ path, range: range as SymbolIdentity["location"]["range"] });
  }
  return result;
}

function validRange(value: unknown): boolean {
  const range = value as {
    start?: { line?: unknown; character?: unknown };
    end?: { line?: unknown; character?: unknown };
  };
  return !!(
    Number.isInteger(range?.start?.line) &&
    Number.isInteger(range.start?.character) &&
    Number.isInteger(range?.end?.line) &&
    Number.isInteger(range.end?.character)
  );
}

function symbolFor(
  location: SymbolIdentity["location"],
  index: number,
  options: DirectLspSemanticOptions,
): SymbolIdentity {
  return {
    id: `${options.language}:${location.path}:${index}`,
    name: location.path,
    language: options.language,
    kind: "symbol",
    location,
  };
}
