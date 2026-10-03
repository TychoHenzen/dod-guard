import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runQualityGuardCli } from "./cli-entrypoint.js";
import { type HttpServerOptions, startMcpHttpServer } from "./http.js";
import { registerQualityGuardTools } from "./server-tools.js";

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const _pkg = JSON.parse(
  readFileSync(path.join(_dirname, "..", "package.json"), "utf-8"),
);

export { text, toolError } from "./tool-response.js";

export function createQualityGuardServer(): McpServer {
  const server = new McpServer({
    name: "quality-guard",
    version: _pkg.version,
  });
  registerQualityGuardTools(server);
  return server;
}

const _filename = fileURLToPath(import.meta.url);
export function startQualityGuardHttpServer(
  options: Omit<HttpServerOptions, "serviceName" | "createMcpServer"> = {},
) {
  return startMcpHttpServer({
    ...options,
    serviceName: "quality-guard",
    createMcpServer: createQualityGuardServer,
  });
}

function isMainModule(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return realpathSync(arg) === realpathSync(_filename);
  } catch {
    return arg === _filename;
  }
}

if (isMainModule()) {
  runQualityGuardCli(process.argv.slice(2), {
    createServer: createQualityGuardServer,
    startHttp: startQualityGuardHttpServer,
  }).catch((err) => {
    process.stderr.write(`quality-guard MCP server failed: ${err}\n`);
    process.exit(1);
  });
}
