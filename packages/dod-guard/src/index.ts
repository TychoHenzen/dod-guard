/**
 * dod-guard MCP server. The 13 tool adapters that authored, refined,
 * generated, or checked a DoD proof tree are gone - see
 * openspec/changes/route-skills-through-openspec. This server currently
 * registers no tools; `cover` lands in a later step of that change.
 */
import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isCliInvocation, runCli } from "./cli.js";

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const _pkgPath = path.join(_dirname, "..", "package.json");
const _pkg = JSON.parse(readFileSync(_pkgPath, "utf-8"));

const server = new McpServer({ name: "dod-guard", version: _pkg.version });

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
