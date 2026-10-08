import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runQualityReportAsync } from "./report.js";
import { requireRepositoryRoot } from "./repository-root.js";
import { text, toolError } from "./tool-response.js";
import { EXCLUDES, ROOT, TEST_PATHS } from "./tool-schemas.js";

export function registerQualityReport(server: McpServer): void {
  server.tool(
    "quality_report",
    "Score every supported source file under the repository root, list " +
      "unscored project-level findings (such as a missing root build entry " +
      "point) under projectFindings, and return a current-state " +
      "architecture appendix. Read-only and not a gate verdict.",
    {
      root: ROOT,
      excludes: EXCLUDES,
      testPaths: TEST_PATHS,
      profile: z
        .enum(["advisory", "default", "strict"])
        .optional()
        .describe(
          "Advisory profile; default and strict are compatibility aliases",
        ),
    },
    async ({ root, excludes, testPaths, profile }) => {
      try {
        return text(
          JSON.stringify(
            await runQualityReportAsync({
              root: requireRepositoryRoot(root),
              excludes,
              testPaths,
              profile,
            }),
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
