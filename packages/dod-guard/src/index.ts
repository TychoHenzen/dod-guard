/**
 * dod-guard MCP server. Registers `cover` and `complete` tools
 * alongside the CLI entry point in the same binary.
 */
import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isCliInvocation, runCli } from "./cli.js";
import { registerTools } from "./mcp-tools.js";
import { runtimeRoot } from "./runtime-root.js";

const _pkgPath = path.join(runtimeRoot, "package.json");
const _pkg = JSON.parse(readFileSync(_pkgPath, "utf-8"));

export function createServer(): McpServer {
  const server = new McpServer({ name: "dod-guard", version: _pkg.version });
  registerTools(server);
  return server;
}

const server = createServer();

const _filename = fileURLToPath(import.meta.url);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
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
  const argv = process.argv.slice(2);
  if (isCliInvocation(argv)) {
    runCli(argv)
      .then((code) => process.exit(code))
      .catch((err) => {
        process.stderr.write(`dod-guard CLI failed: ${err}\n`);
        process.exit(1);
      });
  } else {
    main().catch((err) => {
      process.stderr.write(`dod-guard MCP server failed: ${err}\n`);
      process.exit(1);
    });
  }
}
