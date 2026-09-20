import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTestQualityReport } from "./test-quality/report.js";
import { text, toolError } from "./tool-response.js";
import { ROOT } from "./tool-schemas.js";

export function registerQualityTestQuality(server: McpServer): void {
  server.tool(
    "quality_test_quality",
    "Evaluate explicit test-quality evidence for Clean Code T1-T9. " +
      "Report-only: missing runtime or behavior evidence stays a visible gap " +
      "and never becomes a universal percentage gate.",
    {
      root: ROOT,
      evidence: z
        .string()
        .optional()
        .describe("Evidence JSON path relative to root"),
    },
    qualityTestQuality,
  );
}

async function qualityTestQuality(input: { root?: string; evidence?: string }) {
  try {
    return text(
      JSON.stringify(
        runTestQualityReport({ root: input.root, evidence: input.evidence }),
        null,
        2,
      ),
    );
  } catch (error) {
    return toolError(error);
  }
}
