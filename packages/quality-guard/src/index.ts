import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as stdio from "@modelcontextprotocol/sdk/server/stdio.js";
import { runCheckCommand } from "./commit-gate/cli.js";
import { runQualityReport } from "./report.js";
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

const server = createQualityGuardServer();
const _filename = fileURLToPath(import.meta.url);

function runReportCommand(args: string[]): void {
  const root = args
    .find((arg) => arg.startsWith("--root="))
    ?.slice("--root=".length);
  process.stdout.write(
    `${JSON.stringify(runQualityReport({ root }), null, 2)}\n`,
  );
}

function runCheckCommandLine(args: string[]): void {
  const result = runCheckCommand(args);
  process.stdout.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
}

function isCheckCommand(args: string[]): boolean {
  return args[0] === "check" || args[0] === "acknowledge";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "report") return runReportCommand(args);
  if (isCheckCommand(args)) return runCheckCommandLine(args);
  await server.connect(new stdio.StdioServerTransport());
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
  main().catch((err) => {
    process.stderr.write(`quality-guard MCP server failed: ${err}\n`);
    process.exit(1);
  });
}
