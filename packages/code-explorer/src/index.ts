import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const filename = fileURLToPath(import.meta.url);
const packagePath = path.join(path.dirname(filename), "..", "package.json");
const packageInfo = JSON.parse(readFileSync(packagePath, "utf-8")) as { version: string };

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "code-explorer", version: packageInfo.version },
    { capabilities: { tools: {} } },
  );
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
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
    process.stderr.write(`code-explorer MCP server failed: ${error}\n`);
    process.exit(1);
  });
}
