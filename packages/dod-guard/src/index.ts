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
import { z } from "zod";
import { isCliInvocation, runCli } from "./cli.js";
import { runCoverage } from "./cover/run.js";
import { runtimeRoot } from "./runtime-root.js";

const _pkgPath = path.join(runtimeRoot, "package.json");
const _pkg = JSON.parse(readFileSync(_pkgPath, "utf-8"));

export function createServer(): McpServer {
  const server = new McpServer({ name: "dod-guard", version: _pkg.version });

  server.registerTool(
    "cover",
    {
      description: "Report OpenSpec scenario coverage for a consumer workspace.",
      inputSchema: {
        cwd: z.string().describe("Absolute path to the consumer workspace."),
        changeId: z.string().optional().describe("OpenSpec change id to scan."),
        all: z.boolean().optional().default(false).describe("Scan all main OpenSpec specifications."),
      },
    },
    async ({ cwd, changeId, all }) => {
      const result = await runCoverage({ cwd, changeId, all, writeBaseline: false });
      const serialized = JSON.stringify(result);
      return {
        content: [{ type: "text", text: serialized }],
        structuredContent: JSON.parse(serialized),
      };
    },
  );

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
