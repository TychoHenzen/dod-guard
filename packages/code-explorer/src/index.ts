import { Buffer } from "node:buffer";
import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { type LandmarkDiscovery, landmarksNotReady } from "./discovery/landmarks.js";
import { normalizeDiscoveryQuery } from "./discovery/matcher.js";
import { createDiscoveryPipeline, type DiscoveryPipeline } from "./discovery/pipeline.js";
import { countSensitivePathsUnderRoot } from "./discovery/sensitive-paths.js";
import { createFocusView, FocusBodyLimitError, type FocusView, mintOpaqueId } from "./navigation/focus-view.js";
import {
  BackendCapacityError,
  BackendRequestLimiter,
  BackendTimeoutError,
  type ResourceLimit,
  validateResourceLimits,
} from "./navigation/resource-limits.js";
import { SessionCapacityError, SessionManager } from "./navigation/session.js";
import { loadAdapterSelectionRecord } from "./semantic/adapter-selection.js";
import { createBackendStatusReport } from "./semantic/backend-status.js";
import type { RelationName, RelationResult, SymbolIdentity } from "./semantic/contract.js";
import type { LanguageAdapter } from "./semantic/language-adapter.js";
import { createNativeProjectRoot, ProjectPathError, type ProjectRoot } from "./semantic/project-root.js";
import { createStartedRuntimeAdapters } from "./semantic/runtime-bootstrap.js";

const filename = fileURLToPath(import.meta.url);
const packagePath = path.join(path.dirname(filename), "..", "package.json");
const packageInfo = JSON.parse(readFileSync(packagePath, "utf-8")) as { version: string };

const toolNames = ["code_search", "code_focus", "code_follow", "code_history", "code_status"] as const;
type ToolName = (typeof toolNames)[number];
type EnvelopeState = "ready" | "refreshed" | "unavailable_relation" | "landmarks_not_ready";

export type CodeExplorerState = {
  refresh_generation: number;
  view_history: readonly string[];
};

export type CodeExplorerError = {
  schema_version: 1;
  code:
    | "unknown_tool"
    | "invalid_request"
    | "path_outside_project"
    | "resource_limit"
    | "backend_timeout"
    | "project_capacity"
    | "invalid_session"
    | "invalid_view_handle"
    | "stale_view"
    | "request_id_conflict";
  message: CodeExplorerError["code"];
  retryable: boolean;
  details?: { field: string; limit: number; actual: number };
};

export type CodeExplorerEnvelope = {
  schema_version: 1;
  project_id: string;
  project_generation: number;
  pending_generation: null;
  state: EnvelopeState;
  data: Record<string, unknown>;
};

export type CodeExplorerServer = {
  mcp: McpServer;
  call(name: string, arguments_: Record<string, unknown>): Promise<CodeExplorerEnvelope | CodeExplorerError>;
  state(): CodeExplorerState;
  projectRoot: ProjectRoot | undefined;
  closeConnection(): void;
};

function isToolName(name: string): name is ToolName {
  return toolNames.includes(name as ToolName);
}

function unknownTool(): CodeExplorerError {
  return { schema_version: 1, code: "unknown_tool", message: "unknown_tool", retryable: false };
}

function invalidRequest(): CodeExplorerError {
  return { schema_version: 1, code: "invalid_request", message: "invalid_request", retryable: false };
}

function pathOutsideProject(): CodeExplorerError {
  return { schema_version: 1, code: "path_outside_project", message: "path_outside_project", retryable: false };
}

function resourceLimit(): CodeExplorerError {
  return { schema_version: 1, code: "resource_limit", message: "resource_limit", retryable: false };
}

function limitedResource(limit: ResourceLimit): CodeExplorerError {
  return { ...resourceLimit(), details: limit };
}

function backendTimeout(): CodeExplorerError {
  return { schema_version: 1, code: "backend_timeout", message: "backend_timeout", retryable: true };
}

function invalidSession(): CodeExplorerError {
  return { schema_version: 1, code: "invalid_session", message: "invalid_session", retryable: true };
}

function projectCapacity(): CodeExplorerError {
  return { schema_version: 1, code: "project_capacity", message: "project_capacity", retryable: true };
}

function invalidViewHandle(): CodeExplorerError {
  return { schema_version: 1, code: "invalid_view_handle", message: "invalid_view_handle", retryable: false };
}

function staleView(): CodeExplorerError {
  return { schema_version: 1, code: "stale_view", message: "stale_view", retryable: false };
}

function requestIdConflict(): CodeExplorerError {
  return { schema_version: 1, code: "request_id_conflict", message: "request_id_conflict", retryable: false };
}

function hasValidRequestId(value: string): boolean {
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= 16 && bytes <= 128;
}

const schemas = {
  code_search: z
    .object({
      query: z.string(),
      path_globs: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      kinds: z.array(z.string()).optional(),
      content: z.enum(["all", "production", "tests"]).optional(),
      include_generated: z.boolean().optional(),
      limit: z.number().int().optional(),
    })
    .strict(),
  code_focus: z
    .object({
      session_id: z.string(),
      request_id: z.string(),
      symbol_id: z.string(),
      body_limit_bytes: z.number().int().optional(),
    })
    .strict(),
  code_follow: z
    .object({
      session_id: z.string(),
      request_id: z.string(),
      view_id: z.string(),
      handle: z.string(),
      relation: z.enum(["definition", "references", "callers", "callees", "type", "implementation"]),
      limit: z.number().int().optional(),
    })
    .strict(),
  code_history: z.union([
    z.object({ session_id: z.string(), request_id: z.string(), action: z.enum(["back", "forward"]) }).strict(),
    z
      .object({
        session_id: z.string(),
        request_id: z.string(),
        action: z.literal("recent"),
        limit: z.number().int().optional(),
      })
      .strict(),
  ]),
  code_status: z.union([
    z.object({ action: z.enum(["status", "start_session"]) }).strict(),
    z.object({ action: z.literal("refresh"), session_id: z.string(), request_id: z.string() }).strict(),
  ]),
} as const;

const inputSchemas = {
  code_search: {
    type: "object",
    properties: {
      query: { type: "string" },
      path_globs: { type: "array", items: { type: "string" } },
      languages: { type: "array", items: { type: "string" } },
      kinds: { type: "array", items: { type: "string" } },
      content: { enum: ["all", "production", "tests"] },
      include_generated: { type: "boolean" },
      limit: { type: "integer" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  code_focus: {
    type: "object",
    properties: {
      session_id: { type: "string" },
      request_id: { type: "string" },
      symbol_id: { type: "string" },
      body_limit_bytes: { type: "integer" },
    },
    required: ["session_id", "request_id", "symbol_id"],
    additionalProperties: false,
  },
  code_follow: {
    type: "object",
    properties: {
      session_id: { type: "string" },
      request_id: { type: "string" },
      view_id: { type: "string" },
      handle: { type: "string" },
      relation: { enum: ["definition", "references", "callers", "callees", "type", "implementation"] },
      limit: { type: "integer" },
    },
    required: ["session_id", "request_id", "view_id", "handle", "relation"],
    additionalProperties: false,
  },
  code_history: {
    type: "object",
    oneOf: [
      {
        type: "object",
        properties: {
          session_id: { type: "string" },
          request_id: { type: "string" },
          action: { enum: ["back", "forward"] },
        },
        required: ["session_id", "request_id", "action"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          session_id: { type: "string" },
          request_id: { type: "string" },
          action: { const: "recent" },
          limit: { type: "integer" },
        },
        required: ["session_id", "request_id", "action"],
        additionalProperties: false,
      },
    ],
  },
  code_status: {
    type: "object",
    oneOf: [
      {
        type: "object",
        properties: { action: { const: "status" } },
        required: ["action"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: { action: { const: "start_session" } },
        required: ["action"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: { action: { const: "refresh" }, session_id: { type: "string" }, request_id: { type: "string" } },
        required: ["action", "session_id", "request_id"],
        additionalProperties: false,
      },
    ],
  },
} as const;

function textResult(result: CodeExplorerEnvelope | CodeExplorerError, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function createServer(
  options: {
    adapters?: readonly LanguageAdapter[];
    projectRoot?: ProjectRoot;
    sensitive_paths_excluded?: number;
    landmarks?: LandmarkDiscovery;
    connection_id?: string;
    now?: () => number;
    backend_timeout_ms?: number;
  } = {},
): CodeExplorerServer {
  let refreshGeneration = 0;
  const viewHistory: string[] = [];
  const connectionId = options.connection_id ?? mintOpaqueId();
  const sessions = new SessionManager();
  const backendRequests = new BackendRequestLimiter(options.backend_timeout_ms);
  let refreshing: Promise<void> | undefined;
  const mcp = new McpServer({ name: "code-explorer", version: packageInfo.version }, { capabilities: { tools: {} } });
  const discovery: DiscoveryPipeline | undefined = options.projectRoot
    ? createDiscoveryPipeline(options.projectRoot)
    : undefined;

  const call = async (
    name: string,
    arguments_: Record<string, unknown>,
  ): Promise<CodeExplorerEnvelope | CodeExplorerError> => {
    if (!isToolName(name)) return unknownTool();
    const limit = validateResourceLimits(name, arguments_);
    if (limit) return limitedResource(limit);
    const parsed = schemas[name].safeParse(arguments_);
    if (!parsed.success) return invalidRequest();
    if (name === "code_status" && arguments_.action === "start_session") {
      const sessionId = sessions.tryStart(connectionId, options.now?.());
      if (!sessionId) return projectCapacity();
      return {
        schema_version: 1,
        project_id: "project",
        project_generation: 0,
        pending_generation: null,
        state: "ready",
        data: { session_id: sessionId },
      };
    }
    const parsedArguments = parsed.data as Record<string, unknown>;
    const sessionId = typeof parsedArguments.session_id === "string" ? parsedArguments.session_id : undefined;
    const requestId = typeof parsedArguments.request_id === "string" ? parsedArguments.request_id : undefined;
    const stateChanging =
      name === "code_focus" ||
      name === "code_follow" ||
      name === "code_history" ||
      (name === "code_status" && arguments_.action === "refresh");
    if (stateChanging && !(requestId && hasValidRequestId(requestId) && sessionId)) return invalidRequest();

    const perform = async (): Promise<CodeExplorerEnvelope | CodeExplorerError> => {
      if (name === "code_status" && arguments_.action === "refresh") {
        if (!refreshing) {
          refreshGeneration += 1;
          const activeRefresh = Promise.all(
            (options.adapters ?? []).flatMap((adapter) => {
              const refresh = adapter.refresh;
              return refresh ? [backendRequests.run(sessionId, () => refresh())] : [];
            }),
          ).then(() => undefined);
          refreshing = activeRefresh;
          void activeRefresh.then(
            () => {
              if (refreshing === activeRefresh) refreshing = undefined;
            },
            () => {
              if (refreshing === activeRefresh) refreshing = undefined;
            },
          );
        }
        await refreshing;
      }
      if (name === "code_focus") {
        const focus = schemas.code_focus.parse(arguments_);
        const selected = await collectFocusedSymbol(options.adapters ?? [], focus.symbol_id, (operation) =>
          backendRequests.run(focus.session_id, operation),
        );
        if (selected) {
          try {
            const view = createFocusView(selected.symbol, selected.content, focus.body_limit_bytes);
            if (sessions.addView(connectionId, focus.session_id, view) === "project_capacity") return projectCapacity();
            viewHistory.push(view.view_id);
            return {
              schema_version: 1,
              project_id: "project",
              project_generation: selected.revision.generation,
              pending_generation: null,
              state: "ready",
              data: { ...view, history_position: sessions.historyPosition(connectionId, focus.session_id) ?? 0 },
            };
          } catch (error) {
            if (error instanceof FocusBodyLimitError) return resourceLimit();
            throw error;
          }
        }
      }
      const relation = arguments_.relation;
      if (name === "code_follow" && typeof relation === "string") {
        const follow = schemas.code_follow.parse(arguments_);
        const resolved = sessions.resolveHandle(connectionId, follow.session_id, follow.view_id, follow.handle);
        if (resolved.state === "stale_view") return staleView();
        if (resolved.state !== "ok") return invalidViewHandle();
        const symbolId = resolved.symbolId;
        const semanticRelation = follow.relation === "type" ? "type_definition" : follow.relation;
        const replies = await collectRelations(options.adapters ?? [], semanticRelation, symbolId, (operation) =>
          backendRequests.run(follow.session_id, operation),
        );
        if (replies.length === 0) {
          return {
            schema_version: 1,
            project_id: "project",
            project_generation: 0,
            pending_generation: null,
            state: "unavailable_relation",
            data: { relation },
          };
        }
        const { adapter, result } = replies[0];
        const limit = Math.min(follow.limit ?? 50, 200);
        const candidates = result.relations
          .map((candidate) =>
            relationCandidate(candidate, relation, adapter, sessions, connectionId, follow.session_id),
          )
          .sort(compareRelationCandidates)
          .slice(0, limit);
        if (relation === "definition") {
          const local = candidates.find((candidate) => candidate.external === false);
          if (local) {
            return {
              schema_version: 1,
              project_id: "project",
              project_generation: result.revision.generation,
              pending_generation: null,
              state: "ready",
              data: { focus: local, source_location: local.range },
            };
          }
        }
        return {
          schema_version: 1,
          project_id: "project",
          project_generation: result.revision.generation,
          pending_generation: null,
          state: "ready",
          data: { relation, candidates },
        };
      }
      if (name === "code_history") {
        const history = schemas.code_history.parse(arguments_);
        if (history.action === "recent") {
          const recent = sessions.recent(connectionId, history.session_id, history.limit ?? 64);
          if (!recent) return invalidSession();
          return {
            schema_version: 1,
            project_id: "project",
            project_generation: 0,
            pending_generation: null,
            state: "ready",
            data: { views: recent },
          };
        }
        const restored = sessions.restore(connectionId, history.session_id, history.action);
        if (!restored) return invalidViewHandle();
        return {
          schema_version: 1,
          project_id: "project",
          project_generation: 0,
          pending_generation: null,
          state: "ready",
          data: { ...restored, history_position: sessions.historyPosition(connectionId, history.session_id) ?? 0 },
        };
      }
      if (name === "code_search" && discovery) {
        const search = schemas.code_search.parse(arguments_);
        if (normalizeDiscoveryQuery(search.query).length === 0) {
          const landmarks = options.landmarks ?? landmarksNotReady();
          return {
            schema_version: 1,
            project_id: "project",
            project_generation: 0,
            pending_generation: null,
            state: landmarks.state === "ready" ? "ready" : "landmarks_not_ready",
            data: { landmarks: landmarks.landmarks, landmark_state: landmarks.state },
          };
        }
        const semanticSymbols = await collectSemanticSymbols(options.adapters ?? [], search.query, (operation) =>
          backendRequests.run(undefined, operation),
        );
        let results: ReturnType<DiscoveryPipeline["searchResult"]>;
        try {
          results = discovery.searchResult(search.query, search, semanticSymbols);
        } catch (error) {
          if (error instanceof ProjectPathError && error.code === "path_outside_project") return pathOutsideProject();
          throw error;
        }
        return {
          schema_version: 1,
          project_id: "project",
          project_generation: 0,
          pending_generation: null,
          state: "ready",
          data: results,
        };
      }
      const backendStatus =
        name === "code_status"
          ? {
              backend_status: createBackendStatusReport(options.adapters ?? []),
              sensitive_paths_excluded: options.sensitive_paths_excluded ?? 0,
              ...discovery?.status(),
            }
          : {};
      return {
        schema_version: 1,
        project_id: "project",
        project_generation: 0,
        pending_generation: null,
        state: name === "code_status" && arguments_.action === "refresh" ? "refreshed" : "ready",
        data: backendStatus,
      };
    };

    if (stateChanging && sessionId && requestId) {
      const execution = sessions.execute(
        connectionId,
        sessionId,
        requestId,
        name,
        parsedArguments,
        perform,
        options.now?.(),
      );
      if (execution.state === "invalid_session") return invalidSession();
      if (execution.state === "request_id_conflict") return requestIdConflict();
      if (execution.state === "project_capacity") return projectCapacity();
      if (execution.state === "ok") return execution.response.catch(normalizeBackendFailure);
      return invalidSession();
    }
    return perform().catch(normalizeBackendFailure);
  };

  mcp.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: toolNames.map((name) => ({
      name,
      description: "Read-only Code Explorer navigation operation.",
      inputSchema: inputSchemas[name],
    })),
  }));
  mcp.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await call(request.params.name, request.params.arguments ?? {});
    return textResult(result, "code" in result);
  });

  return {
    mcp,
    call,
    state: () => ({ refresh_generation: refreshGeneration, view_history: [...viewHistory] }),
    projectRoot: options.projectRoot,
    closeConnection: () => sessions.closeConnection(connectionId),
  };
}

/** Workspace-symbol replies are discovery evidence only. Relation authority remains in the language adapters. */
function normalizeBackendFailure(error: unknown): CodeExplorerError {
  if (error instanceof BackendTimeoutError) return backendTimeout();
  if (error instanceof BackendCapacityError) return resourceLimit();
  if (error instanceof SessionCapacityError) return projectCapacity();
  throw error;
}

type BackendOperation = <T>(operation: () => Promise<T>) => Promise<T>;

async function collectSemanticSymbols(adapters: readonly LanguageAdapter[], query: string, run: BackendOperation) {
  const replies = await Promise.allSettled(
    adapters.map((adapter) => run(() => adapter.request({ operation: "search", query }))),
  );
  throwBackendLimitFailure(replies);
  return replies.flatMap((reply) =>
    reply.status === "fulfilled" && reply.value.operation === "search" ? reply.value.symbols : [],
  );
}

async function collectFocusedSymbol(adapters: readonly LanguageAdapter[], symbolId: string, run: BackendOperation) {
  const replies = await Promise.allSettled(
    adapters.map((adapter) => run(() => adapter.request({ operation: "focus", symbol_id: symbolId }))),
  );
  throwBackendLimitFailure(replies);
  return replies.find(
    (
      reply,
    ): reply is PromiseFulfilledResult<
      Extract<Awaited<ReturnType<LanguageAdapter["request"]>>, { operation: "focus" }>
    > => reply.status === "fulfilled" && reply.value.operation === "focus",
  )?.value;
}

type FollowCandidate = {
  relation: string;
  relation_source: "semantic";
  backend_name: string;
  backend_version: string;
  external: boolean;
  symbol_id?: string;
  display_name?: string;
  path?: string;
  kind?: string;
  range?: SymbolIdentity["location"]["range"];
  call_site?: SymbolIdentity["location"];
  view_id?: string;
  handle?: string;
  content?: FocusView["content"];
};

async function collectRelations(
  adapters: readonly LanguageAdapter[],
  relation: RelationName,
  symbolId: string,
  run: BackendOperation,
) {
  const supported = adapters.filter((adapter) => adapter.status().capabilities[relation].state === "ready");
  const replies = await Promise.allSettled(
    supported.map((adapter) => run(() => adapter.request({ operation: relation, symbol_id: symbolId }))),
  );
  throwBackendLimitFailure(replies);
  return replies.flatMap((reply, index) =>
    reply.status === "fulfilled" && reply.value.operation === relation
      ? [{ adapter: supported[index], result: reply.value as RelationResult }]
      : [],
  );
}

function throwBackendLimitFailure(replies: readonly PromiseSettledResult<unknown>[]): void {
  const failed = replies.find(
    (reply): reply is PromiseRejectedResult =>
      reply.status === "rejected" &&
      (reply.reason instanceof BackendTimeoutError || reply.reason instanceof BackendCapacityError),
  );
  if (failed) throw failed.reason;
}

function relationCandidate(
  candidate: RelationResult["relations"][number],
  relation: string,
  adapter: LanguageAdapter,
  sessions: SessionManager,
  connectionId: string,
  sessionId: string,
): FollowCandidate {
  const status = adapter.status();
  if ("external" in candidate) {
    return {
      relation,
      relation_source: "semantic",
      backend_name: status.backend_name,
      backend_version: status.backend_version,
      display_name: candidate.external.display_name,
      external: true,
    };
  }
  const symbol = candidate.symbol;
  const view = createFocusView(symbol, {
    declaration: symbol.name,
    visible_symbols: [{ name: symbol.name, symbol_id: symbol.id }],
  });
  if (sessions.addView(connectionId, sessionId, view) !== "ok") throw new SessionCapacityError();
  const handle = view.handles[0]?.handle;
  const sourceRange = "range" in candidate.location ? candidate.location.range : symbol.location.range;
  return {
    relation,
    relation_source: "semantic",
    backend_name: status.backend_name,
    backend_version: status.backend_version,
    symbol_id: view.symbol_id,
    path: symbol.location.path.replaceAll("\\", "/"),
    kind: symbol.kind,
    range: sourceRange,
    ...(candidate.call_site
      ? { call_site: { path: candidate.call_site.path.replaceAll("\\", "/"), range: candidate.call_site.range } }
      : {}),
    external: false,
    view_id: view.view_id,
    ...(handle ? { handle } : {}),
    content: view.content,
  };
}

function compareRelationCandidates(left: FollowCandidate, right: FollowCandidate): number {
  if (left.external !== right.external) return left.external ? 1 : -1;
  return `${left.path ?? ""}\u0000${left.range?.start.line ?? 0}\u0000${left.range?.start.character ?? 0}\u0000${left.kind ?? ""}\u0000${left.symbol_id ?? left.display_name ?? ""}`.localeCompare(
    `${right.path ?? ""}\u0000${right.range?.start.line ?? 0}\u0000${right.range?.start.character ?? 0}\u0000${right.kind ?? ""}\u0000${right.symbol_id ?? right.display_name ?? ""}`,
  );
}

async function main(): Promise<void> {
  loadAdapterSelectionRecord();
  const projectRoot = createNativeProjectRoot(parseProjectRootArgument(process.argv.slice(2)));
  const adapters = await createStartedRuntimeAdapters(projectRoot);
  const server = createServer({
    projectRoot,
    adapters,
    sensitive_paths_excluded: countSensitivePathsUnderRoot(projectRoot.canonicalPath),
  });
  const transport = new StdioServerTransport();
  let shuttingDown: Promise<void> | undefined;
  const shutdownBackends = () => {
    shuttingDown ??= Promise.allSettled(adapters.map((adapter) => adapter.shutdown?.())).then(() => undefined);
    return shuttingDown;
  };
  transport.onclose = () => {
    server.closeConnection();
    void shutdownBackends();
  };
  process.stdin.once("end", () => void shutdownBackends());
  await server.mcp.connect(transport);
}

function parseProjectRootArgument(arguments_: readonly string[]): string | undefined {
  if (arguments_.length === 0) return undefined;
  if (arguments_.length === 2 && arguments_[0] === "--project-root" && arguments_[1].length > 0) return arguments_[1];
  throw new ProjectPathError("invalid_project_root", "project_root");
}

function isMainModule(): boolean {
  const argument = process.argv[1];
  if (!argument) return false;
  try {
    return realpathSync(argument) === realpathSync(filename);
  } catch {
    return argument === filename;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    const message = error instanceof ProjectPathError ? `${error.code}:${error.root_source ?? "cwd"}` : String(error);
    process.stderr.write(`code-explorer MCP server failed: ${message}\n`);
    process.exit(1);
  });
}
