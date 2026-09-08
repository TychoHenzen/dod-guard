import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { packageInfo } from "../package-info.js";
import { createServerCall } from "./server-call.js";
import type { CodeExplorerServer } from "./server-contract.js";
import { createServerRuntime } from "./create-runtime.js";
import { inputSchemas } from "./input-schemas.js";
import { toolDescriptions } from "./tool-descriptions.js";
import { toolNames } from "./tool-name.js";
import { toMcpToolResult } from "./tool-result.js";
import type { ServerOptions } from "./server-options.js";

export function createServer(options: ServerOptions = {}): CodeExplorerServer {
  const runtime = createServerRuntime(options);
  const mcp = new McpServer(
    { name: "code-explorer", version: packageInfo.version },
    { capabilities: { tools: {} } },
  );
  const call = createServerCall(runtime);
  mcp.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: toolNames.map((name) => ({
      name,
      description: toolDescriptions[name],
      inputSchema: inputSchemas[name],
    })),
  }));
  mcp.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await call(
      request.params.name,
      request.params.arguments ?? {},
    );
    return toMcpToolResult(result, "code" in result);
  });
  return {
    mcp,
    call,
    state: () => ({
      refresh_generation: runtime.state.refreshGeneration,
      view_history: [...runtime.state.viewHistory],
    }),
    projectRoot: options.projectRoot,
    closeConnection: () =>
      runtime.sessions.closeConnection(runtime.connectionId),
    close: async () => {
      runtime.sessions.closeConnection(runtime.connectionId);
      await runtime.freshness.close();
    },
  };
}
