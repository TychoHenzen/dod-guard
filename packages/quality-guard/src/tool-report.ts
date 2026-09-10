import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runQualityReport } from "./report.js";
import { formatSkips, readSkipLog } from "./skips.js";
import { text, toolError } from "./tool-response.js";
import { EXCLUDES, ROOT, TEST_PATHS } from "./tool-schemas.js";

export function registerQualityReport(server: McpServer): void {
  server.tool(
    "quality_report",
    "Score every supported source file under the repository root and return " +
      "a current-state architecture appendix. Read-only and not a gate " +
      "verdict.",
    {
      root: ROOT,
      excludes: EXCLUDES,
      testPaths: TEST_PATHS,
      profile: z.enum(["default", "strict"]).optional(),
    },
    async ({ root, excludes, testPaths, profile }) => {
      try {
        return text(
          JSON.stringify(
            runQualityReport({ root, excludes, testPaths, profile }),
            null,
            2,
          ),
        );
      } catch (err) {
        return toolError(err);
      }
    },
  );
}

export function registerQualitySkips(server: McpServer): void {
  server.tool(
    "quality_skips",
    "List .quality-skip waivers that were consumed but never acknowledged. " +
      "Each one is a place where the quality gate was bypassed on purpose. " +
      "The pre-commit hook refuses to commit while any remain open.",
    { root: z.string().describe("Repository root") },
    async ({ root }) => {
      try {
        return text(formatSkips(readSkipLog(root)));
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
