import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  BrowserServerError,
  type ExplorerCoreFactory,
  nativeBrowserOpener,
  nativePortBinder,
  parseServeArguments,
  startBrowserServer,
} from "./browser-server/lifecycle.js";
import { type LandmarkDiscovery, landmarksNotReady } from "./discovery/landmarks.js";
import { normalizeDiscoveryQuery } from "./discovery/matcher.js";
import { createDiscoveryPipeline, type DiscoveryPipeline } from "./discovery/pipeline.js";
import { countSensitivePathsUnderRoot } from "./discovery/sensitive-paths.js";
import { ProjectGenerationScheduler } from "./freshness/project-generation-scheduler.js";
import {
  createNativeWorkspaceFreshness,
  type FreshnessStatus,
  WorkspaceFreshness,
} from "./freshness/workspace-freshness.js";
import { type CodeExplorerError, codeExplorerError, normalizeError } from "./navigation/error.js";
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
import { RootAccessGate } from "./semantic/root-access.js";
import { createStartedRuntimeAdapters } from "./semantic/runtime-bootstrap.js";

const filename = fileURLToPath(import.meta.url);
const packagePath = path.join(path.dirname(filename), "..", "package.json");
const packageInfo = JSON.parse(readFileSync(packagePath, "utf-8")) as { version: string };

const toolNames = ["code_search", "code_focus", "code_follow", "code_history", "code_status"] as const;
type ToolName = (typeof toolNames)[number];
type EnvelopeState =
  | "ready"
  | "refreshed"
  | "refreshing"
  | "degraded"
  | "refresh_failed"
  | "unavailable_relation"
  | "landmarks_not_ready";

export type CodeExplorerState = {
  refresh_generation: number;
  view_history: readonly string[];
};

export type { CodeExplorerError } from "./navigation/error.js";

export type CodeExplorerEnvelope = {
  schema_version: 1;
  project_id: string;
  project_generation: number;
  pending_generation: number | null;
  state: EnvelopeState;
  data: Record<string, unknown>;
};

export type CodeExplorerServer = {
  mcp: McpServer;
  call(name: string, arguments_: Record<string, unknown>): Promise<CodeExplorerEnvelope | CodeExplorerError>;
  state(): CodeExplorerState;
  projectRoot: ProjectRoot | undefined;
  closeConnection(): void;
  close(): Promise<void>;
};

function isToolName(name: string): name is ToolName {
  return toolNames.includes(name as ToolName);
}

function unknownTool(): CodeExplorerError {
  return codeExplorerError("unknown_tool");
}

function invalidRequest(): CodeExplorerError {
  return codeExplorerError("invalid_request");
}

function pathOutsideProject(): CodeExplorerError {
  return codeExplorerError("path_outside_project");
}

function resourceLimit(): CodeExplorerError {
  return codeExplorerError("resource_limit");
}

function limitedResource(limit: ResourceLimit): CodeExplorerError {
  return codeExplorerError("resource_limit", limit);
}

function backendTimeout(): CodeExplorerError {
  return codeExplorerError("backend_timeout");
}

function invalidSession(): CodeExplorerError {
  return codeExplorerError("invalid_session");
}

function projectCapacity(): CodeExplorerError {
  return codeExplorerError("project_capacity");
}

function invalidViewHandle(): CodeExplorerError {
  return codeExplorerError("invalid_view_handle");
}

function staleView(): CodeExplorerError {
  return codeExplorerError("stale_view");
}

function requestIdConflict(): CodeExplorerError {
  return codeExplorerError("request_id_conflict");
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

export function toMcpToolResult(result: CodeExplorerEnvelope | CodeExplorerError, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    ...(isError ? { isError: true } : {}),
  };
}

const toolDescriptions: Record<ToolName, string> = {
  code_search: "Search the frozen project for symbols and files, or return project landmarks for an empty query.",
  code_focus: "Open one search result in a bounded source view owned by an active navigation session.",
  code_follow: "Follow one visible handle from a current view through a named semantic relation.",
  code_history: "Restore a prior or next immutable view, or list recent views in the active navigation session.",
  code_status: "Read workspace and backend status, start a navigation session, or refresh derived navigation data.",
};

export function createServer(
  options: {
    adapters?: readonly LanguageAdapter[];
    projectRoot?: ProjectRoot;
    sensitive_paths_excluded?: number;
    landmarks?: LandmarkDiscovery;
    connection_id?: string;
    now?: () => number;
    backend_timeout_ms?: number;
    freshness?: WorkspaceFreshness;
    generation_scheduler?: ProjectGenerationScheduler;
    /** Rebuilds replacement derived data off to the side of the current generation. */
    rebuild_derived?: () => Promise<{ landmarks?: LandmarkDiscovery } | undefined>;
    workspace_status?: () => Record<string, unknown>;
  } = {},
): CodeExplorerServer {
  let refreshGeneration = 0;
  const viewHistory: string[] = [];
  const connectionId = options.connection_id ?? mintOpaqueId();
  const sessions = new SessionManager();
  const backendRequests = new BackendRequestLimiter(options.backend_timeout_ms);
  const freshness =
    options.freshness ?? new WorkspaceFreshness({ reconcile: async () => ({ manifest: new Map<string, string>() }) });
  let freshnessStarted: Promise<void> | undefined;
  const ensureFreshness = () => (freshnessStarted ??= freshness.start());
  const generationScheduler = options.generation_scheduler ?? new ProjectGenerationScheduler(freshness);
  const rootAccess = new RootAccessGate(options.projectRoot, options.adapters ?? [], options.now);
  const mcp = new McpServer({ name: "code-explorer", version: packageInfo.version }, { capabilities: { tools: {} } });
  let discovery: DiscoveryPipeline | undefined = options.projectRoot
    ? createDiscoveryPipeline(options.projectRoot)
    : undefined;
  let landmarks = options.landmarks;

  const call = async (
    name: string,
    arguments_: Record<string, unknown>,
  ): Promise<CodeExplorerEnvelope | CodeExplorerError> => {
    if (!isToolName(name)) return unknownTool();
    const limit = validateResourceLimits(name, arguments_);
    if (limit) return limitedResource(limit);
    const parsed = schemas[name].safeParse(arguments_);
    if (!parsed.success) return invalidRequest();
    if (!(name === "code_status" && arguments_.action === "start_session")) await ensureFreshness();
    if (name === "code_status" && arguments_.action === "start_session") {
      const sessionId = sessions.tryStart(connectionId, options.now?.());
      if (!sessionId) return projectCapacity();
      const rootStatus = await rootAccess.check();
      return {
        schema_version: 1,
        project_id: "project",
        project_generation: 0,
        pending_generation: null,
        state: rootStatus.state === "ready" ? "ready" : "degraded",
        data: {
          session_id: sessionId,
          project_root: ".",
          root_access: rootStatus.state,
          restart_required: rootStatus.restart_required,
        },
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
      const rootStatus = await rootAccess.check();
      if (name !== "code_status" && rootStatus.state !== "ready") return codeExplorerError(rootStatus.state);
      let capturedFreshness: FreshnessStatus;
      if (name === "code_status" && arguments_.action === "refresh") {
        await generationScheduler.refresh(async () => {
          refreshGeneration += 1;
          await Promise.all(
            (options.adapters ?? []).flatMap((adapter) => {
              const refresh = adapter.refresh;
              return refresh ? [backendRequests.run(sessionId, () => refresh())] : [];
            }),
          );
          const replacement = await options.rebuild_derived?.();
          if (options.projectRoot) discovery = createDiscoveryPipeline(options.projectRoot);
          if (replacement?.landmarks) landmarks = replacement.landmarks;
        });
        capturedFreshness = freshness.status();
      } else {
        capturedFreshness = (await generationScheduler.accept()).status;
      }
      if (name === "code_focus") {
        const focus = schemas.code_focus.parse(arguments_);
        const selected = await collectFocusedSymbol(options.adapters ?? [], focus.symbol_id, (operation) =>
          backendRequests.run(focus.session_id, operation),
        );
        if (selected) {
          try {
            const view = createFocusView(
              selected.symbol,
              selected.content,
              focus.body_limit_bytes,
              capturedFreshness.current_generation,
            );
            if (sessions.addView(connectionId, focus.session_id, view) === "project_capacity") return projectCapacity();
            viewHistory.push(view.view_id);
            return {
              schema_version: 1,
              project_id: "project",
              project_generation: capturedFreshness.current_generation,
              pending_generation: capturedFreshness.pending_generation,
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
        const resolved = sessions.resolveHandle(
          connectionId,
          follow.session_id,
          follow.view_id,
          follow.handle,
          capturedFreshness.current_generation,
        );
        if (resolved.state === "stale_view") {
          if (resolved.viewGeneration === undefined) return staleView();
          return codeExplorerError("stale_view", {
            view_generation: resolved.viewGeneration,
            current_generation: resolved.currentGeneration ?? capturedFreshness.current_generation,
          });
        }
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
            project_generation: capturedFreshness.current_generation,
            pending_generation: capturedFreshness.pending_generation,
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
              project_generation: capturedFreshness.current_generation,
              pending_generation: capturedFreshness.pending_generation,
              state: "ready",
              data: { focus: local, source_location: local.range },
            };
          }
        }
        return {
          schema_version: 1,
          project_id: "project",
          project_generation: capturedFreshness.current_generation,
          pending_generation: capturedFreshness.pending_generation,
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
            project_generation: capturedFreshness.current_generation,
            pending_generation: capturedFreshness.pending_generation,
            state: "ready",
            data: { views: recent },
          };
        }
        const restored = sessions.restore(connectionId, history.session_id, history.action);
        if (!restored) return invalidViewHandle();
        return {
          schema_version: 1,
          project_id: "project",
          project_generation: capturedFreshness.current_generation,
          pending_generation: capturedFreshness.pending_generation,
          state: "ready",
          data: {
            ...restored,
            history_position: sessions.historyPosition(connectionId, history.session_id) ?? 0,
            stale: restored.project_generation !== capturedFreshness.current_generation,
          },
        };
      }
      if (name === "code_search" && discovery) {
        const search = schemas.code_search.parse(arguments_);
        if (normalizeDiscoveryQuery(search.query).length === 0) {
          const currentLandmarks = landmarks ?? landmarksNotReady();
          return {
            schema_version: 1,
            project_id: "project",
            project_generation: capturedFreshness.current_generation,
            pending_generation: capturedFreshness.pending_generation,
            state: currentLandmarks.state === "ready" ? "ready" : "landmarks_not_ready",
            data: { landmarks: currentLandmarks.landmarks, landmark_state: currentLandmarks.state },
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
          project_generation: capturedFreshness.current_generation,
          pending_generation: capturedFreshness.pending_generation,
          state: "ready",
          data: results,
        };
      }
      const backendStatus =
        name === "code_status"
          ? {
              backend_status: createBackendStatusReport(options.adapters ?? []),
              sensitive_paths_excluded: options.sensitive_paths_excluded ?? 0,
              project_root: ".",
              current_generation: capturedFreshness.current_generation,
              pending_generation: capturedFreshness.pending_generation,
              workspace_state: capturedFreshness.state,
              pending_analysis: capturedFreshness.pending_generation !== null,
              root_access: rootStatus.state,
              restart_required: rootStatus.restart_required,
              ...(options.workspace_status?.() ?? nativeWorkspaceStatus(options.projectRoot)),
              ...discovery?.status(),
            }
          : {};
      return {
        schema_version: 1,
        project_id: "project",
        project_generation: capturedFreshness.current_generation,
        pending_generation: capturedFreshness.pending_generation,
        state:
          name === "code_status" && rootStatus.state !== "ready"
            ? "degraded"
            : name === "code_status" && arguments_.action === "refresh" && capturedFreshness.state === "ready"
              ? "refreshed"
              : capturedFreshness.state === "refreshing" ||
                  capturedFreshness.state === "degraded" ||
                  capturedFreshness.state === "refresh_failed"
                ? capturedFreshness.state
                : "ready",
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
      description: toolDescriptions[name],
      inputSchema: inputSchemas[name],
    })),
  }));
  mcp.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await call(request.params.name, request.params.arguments ?? {});
    return toMcpToolResult(result, "code" in result);
  });

  return {
    mcp,
    call,
    state: () => ({ refresh_generation: refreshGeneration, view_history: [...viewHistory] }),
    projectRoot: options.projectRoot,
    closeConnection: () => sessions.closeConnection(connectionId),
    close: async () => {
      sessions.closeConnection(connectionId);
      await freshness.close();
    },
  };
}

function nativeWorkspaceStatus(root: ProjectRoot | undefined): Record<string, unknown> {
  if (!root) return { changed_paths: [], untracked_paths: [], active_exclusions: [] };
  try {
    const output = execFileSync(
      "git",
      ["-C", root.canonicalPath, "status", "--porcelain=v1", "--untracked-files=all"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const changed_paths: Array<{ path: string; state: "modified" | "deleted" }> = [];
    const untracked_paths: Array<{ path: string; state: "untracked" }> = [];
    for (const line of output.split(/\r?\n/u)) {
      const status = line.slice(0, 2);
      const candidate = line.slice(3).replaceAll("\\", "/");
      if (
        !candidate ||
        candidate.startsWith("/") ||
        /^[A-Za-z]:\//u.test(candidate) ||
        candidate.split("/").includes("..")
      )
        continue;
      if (!/\.(?:rs|py|cs|ts|tsx|js|jsx|json)$/iu.test(candidate)) continue;
      if (status === "??") untracked_paths.push({ path: candidate, state: "untracked" });
      else changed_paths.push({ path: candidate, state: status.includes("D") ? "deleted" : "modified" });
    }
    return {
      changed_paths,
      untracked_paths,
      active_exclusions: ["dist/**", "target/**", "bin/**", "obj/**", ".venv/**"],
    };
  } catch {
    return { changed_paths: [], untracked_paths: [], active_exclusions: [] };
  }
}

/** Workspace-symbol replies are discovery evidence only. Relation authority remains in the language adapters. */
function normalizeBackendFailure(error: unknown): CodeExplorerError {
  if (error instanceof BackendTimeoutError) return backendTimeout();
  if (error instanceof BackendCapacityError) return resourceLimit();
  if (error instanceof SessionCapacityError) return projectCapacity();
  if (error instanceof ProjectPathError) return codeExplorerError(error.code);
  return normalizeError(error);
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
  const focused = replies.find(
    (
      reply,
    ): reply is PromiseFulfilledResult<
      Extract<Awaited<ReturnType<LanguageAdapter["request"]>>, { operation: "focus" }>
    > => reply.status === "fulfilled" && reply.value.operation === "focus",
  )?.value;
  if (focused) return focused;
  throwBackendLimitFailure(replies);
  return undefined;
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
  const results = replies.flatMap((reply, index) =>
    reply.status === "fulfilled" && reply.value.operation === relation
      ? [{ adapter: supported[index], result: reply.value as RelationResult }]
      : [],
  );
  if (results.length === 0) throwBackendLimitFailure(replies);
  return results;
}

function throwBackendLimitFailure(replies: readonly PromiseSettledResult<unknown>[]): void {
  const failed = replies.find((reply): reply is PromiseRejectedResult => reply.status === "rejected");
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

export function createRuntimeCoreFactory(): ExplorerCoreFactory {
  return {
    async start({ projectRoot }) {
      loadAdapterSelectionRecord();
      const adapters = await createStartedRuntimeAdapters(projectRoot);
      const server = createServer({
        projectRoot,
        adapters,
        sensitive_paths_excluded: countSensitivePathsUnderRoot(projectRoot.canonicalPath),
        freshness: createNativeWorkspaceFreshness({
          root: projectRoot.canonicalPath,
          supported: (candidate) => /\.(?:rs|py|cs|ts|tsx|js|jsx|json)$/iu.test(candidate),
        }),
      });
      return {
        call: (name, arguments_) => server.call(name, arguments_),
        close: async () => {
          await server.close();
          await Promise.allSettled(adapters.map((adapter) => adapter.shutdown?.()));
        },
      };
    },
  };
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_[0] === "serve") {
    const parsed = parseServeArguments(arguments_);
    const service = await startBrowserServer({
      ...parsed,
      coreFactory: createRuntimeCoreFactory(),
      binder: nativePortBinder,
      opener: nativeBrowserOpener,
      write: (line) => process.stdout.write(`${line}\n`),
      writeError: (line) => process.stderr.write(`${line}\n`),
    });
    const shutdown = () => void service.close().then(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    return;
  }
  loadAdapterSelectionRecord();
  const projectRoot = createNativeProjectRoot(parseProjectRootArgument(arguments_));
  const adapters = await createStartedRuntimeAdapters(projectRoot);
  const server = createServer({
    projectRoot,
    adapters,
    sensitive_paths_excluded: countSensitivePathsUnderRoot(projectRoot.canonicalPath),
    freshness: createNativeWorkspaceFreshness({
      root: projectRoot.canonicalPath,
      supported: (candidate) => /\.(?:rs|py|cs|ts|tsx|js|jsx|json)$/iu.test(candidate),
    }),
  });
  const transport = new StdioServerTransport();
  let shuttingDown: Promise<void> | undefined;
  const shutdownBackends = () => {
    shuttingDown ??= Promise.allSettled(adapters.map((adapter) => adapter.shutdown?.())).then(() => undefined);
    return shuttingDown;
  };
  transport.onclose = () => {
    void server.close().then(shutdownBackends);
  };
  process.stdin.once("end", () => void server.close().then(shutdownBackends));
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
    const message =
      error instanceof ProjectPathError
        ? `${error.code}:${error.root_source ?? "cwd"}`
        : error instanceof BrowserServerError
          ? error.code
          : String(error);
    process.stderr.write(`code-explorer MCP server failed: ${message}\n`);
    process.exit(1);
  });
}
