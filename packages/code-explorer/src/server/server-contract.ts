import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CodeExplorerError } from "../navigation/error.js";
import type { ProjectRoot } from "../semantic/api/public-api.js";
import type { CodeExplorerEnvelope } from "./envelope.js";
import type { CodeExplorerState } from "./state.js";

export type CodeExplorerServer = {
  mcp: McpServer;
  call(name: string, arguments_: Record<string, unknown>): Promise<CodeExplorerEnvelope | CodeExplorerError>;
  state(): CodeExplorerState;
  projectRoot: ProjectRoot | undefined;
  closeConnection(): void;
  close(): Promise<void>;
};
