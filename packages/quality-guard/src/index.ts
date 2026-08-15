/**
 * quality-guard MCP server - structural code quality as tools.
 *
 * 3 tools.
 * `quality_scan` measures structure and gives no verdict.
 * `quality_gate` compares against the recorded baseline and returns a verdict.
 * `quality_skips` lists sentinel waivers nobody has acknowledged yet.
 *
 * The PostToolUse hook in .claude-plugin/plugin.json enforces the same
 * baseline on every write. These tools exist so a session can ask the same
 * questions on purpose instead of only meeting the gate by surprise.
 */

import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runScan } from "./scanner.js";
import { formatSkips, readSkipLog } from "./skips.js";

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const _pkg = JSON.parse(readFileSync(path.join(_dirname, "..", "package.json"), "utf-8"));

const server = new McpServer({
  name: "quality-guard",
  version: _pkg.version,
});

const PATHS = z.array(z.string()).min(1).describe("Paths to scan, relative to root");
const ROOT = z
  .string()
  .optional()
  .describe("Repository root. Point this at the repo, not at the target, so manifest files are in scope");

export function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

export function toolError(err: unknown) {
  return { content: [{ type: "text" as const, text: `ERROR: ${err instanceof Error ? err.message : String(err)}` }] };
}

server.tool(
  "quality_scan",
  "Measure structural quality of the given paths and return the raw report. No verdict, no baseline. Use quality_gate to decide pass or fail.",
  {
    paths: PATHS,
    root: ROOT,
    rules: z.array(z.string()).optional().describe("Only run these rules"),
    excludes: z.array(z.string()).optional().describe("Skip paths containing these fragments"),
    testPaths: z.array(z.string()).optional().describe("Treat paths containing these fragments as test code"),
    profile: z.enum(["default", "strict"]).optional(),
  },
  async ({ paths, root, rules, excludes, testPaths, profile }) => {
    try {
      const { report } = runScan({ paths, root, rules, excludes, testPaths, profile });
      return text(JSON.stringify(report, null, 2));
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "quality_gate",
  "Compare the given paths against a recorded baseline and report regressions. " +
    "Existing debt is allowed, making it worse is not. " +
    "A file the baseline has never seen is adopted rather than failed.",
  {
    paths: PATHS,
    baseline: z.string().describe("Path to the baseline, normally .github/quality/quality-baseline.json"),
    root: ROOT,
    rules: z.array(z.string()).optional(),
    excludes: z.array(z.string()).optional(),
    testPaths: z.array(z.string()).optional(),
    failOn: z.enum(["none", "error", "regression", "any"]).optional().describe("Default regression"),
  },
  async ({ paths, baseline, root, rules, excludes, testPaths, failOn }) => {
    try {
      const result = runScan({
        paths,
        baseline,
        root,
        rules,
        excludes,
        testPaths,
        failOn: failOn ?? "regression",
      });
      const verdict = result.exitCode === 0 ? "PASS" : "FAIL";
      return text(`${verdict} (exit ${result.exitCode})\n\n${JSON.stringify(result.report, null, 2)}`);
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "quality_skips",
  "List .quality-skip waivers that were consumed but never acknowledged. " +
    "Each one is a place where the quality gate was bypassed on purpose. " +
    "The pre-commit hook refuses to commit while any remain open.",
  {
    root: z.string().describe("Repository root"),
  },
  async ({ root }) => {
    try {
      return text(formatSkips(readSkipLog(root)));
    } catch (err) {
      return toolError(err);
    }
  },
);

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
  main().catch((err) => {
    process.stderr.write(`quality-guard MCP server failed: ${err}\n`);
    process.exit(1);
  });
}
