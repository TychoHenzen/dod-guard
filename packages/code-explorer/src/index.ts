import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadAdapterSelectionRecord } from "./semantic/adapter-selection.js";
import { createBackendStatusReport } from "./semantic/backend-status.js";
import type { LanguageAdapter } from "./semantic/language-adapter.js";
import { createNativeProjectRoot, ProjectPathError, type ProjectRoot } from "./semantic/project-root.js";
import { createStartedRuntimeAdapters } from "./semantic/runtime-bootstrap.js";

const filename = fileURLToPath(import.meta.url);
const packagePath = path.join(path.dirname(filename), "..", "package.json");
const packageInfo = JSON.parse(readFileSync(packagePath, "utf-8")) as { version: string };

const toolNames = ["code_search", "code_focus", "code_follow", "code_history", "code_status"] as const;
type ToolName = (typeof toolNames)[number];
type EnvelopeState = "ready" | "refreshed" | "unavailable_relation";

export type CodeExplorerState = {
  refresh_generation: number;
  view_history: readonly string[];
};

export type CodeExplorerError = {
  schema_version: 1;
  code: "unknown_tool" | "invalid_request";
  message: "unknown_tool" | "invalid_request";
  retryable: false;
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
  options: { adapters?: readonly LanguageAdapter[]; projectRoot?: ProjectRoot } = {},
): CodeExplorerServer {
  let refreshGeneration = 0;
  const viewHistory: string[] = [];
  const mcp = new McpServer({ name: "code-explorer", version: packageInfo.version }, { capabilities: { tools: {} } });

  const call = async (
    name: string,
    arguments_: Record<string, unknown>,
  ): Promise<CodeExplorerEnvelope | CodeExplorerError> => {
    if (!isToolName(name)) return unknownTool();
    const parsed = schemas[name].safeParse(arguments_);
    if (!parsed.success) return invalidRequest();
    if (name === "code_status" && arguments_.action === "refresh") {
      refreshGeneration += 1;
      await Promise.allSettled(
        (options.adapters ?? []).flatMap((adapter) => (adapter.refresh ? [adapter.refresh()] : [])),
      );
    }
    const relation = arguments_.relation;
    if (name === "code_follow" && typeof relation === "string") {
      return {
        schema_version: 1,
        project_id: "project",
        project_generation: 0,
        pending_generation: null,
        state: "unavailable_relation",
        data: { relation },
      };
    }
    const backendStatus =
      name === "code_status" ? { backend_status: createBackendStatusReport(options.adapters ?? []) } : {};
    return {
      schema_version: 1,
      project_id: "project",
      project_generation: 0,
      pending_generation: null,
      state: name === "code_status" && arguments_.action === "refresh" ? "refreshed" : "ready",
      data: backendStatus,
    };
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
  };
}

async function main(): Promise<void> {
  loadAdapterSelectionRecord();
  const projectRoot = createNativeProjectRoot(parseProjectRootArgument(process.argv.slice(2)));
  const adapters = await createStartedRuntimeAdapters(projectRoot);
  const server = createServer({
    projectRoot,
    adapters,
  });
  const transport = new StdioServerTransport();
  let shuttingDown: Promise<void> | undefined;
  const shutdownBackends = () => {
    shuttingDown ??= Promise.allSettled(adapters.map((adapter) => adapter.shutdown?.())).then(() => undefined);
    return shuttingDown;
  };
  transport.onclose = () => {
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
