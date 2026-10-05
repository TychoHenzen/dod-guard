import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireRepositoryRoot } from "./repository-root.js";
import { runScanAsync, type ScanRequest } from "./scanner.js";
import { text, toolError } from "./tool-response.js";
import { EXCLUDES, PATHS, ROOT, TEST_PATHS } from "./tool-schemas.js";

export function registerQualityScan(server: McpServer): void {
  server.tool(
    "quality_scan",
    QUALITY_SCAN_DESCRIPTION,
    QUALITY_SCAN_INPUT,
    qualityScan,
  );
}
const QUALITY_SCAN_DESCRIPTION =
  "Measure structural quality of the given paths and return advisory evidence. " +
  "This report has no commit, merge, or acceptance authority.";

const QUALITY_SCAN_INPUT = {
  paths: PATHS,
  root: ROOT,
  rules: z.array(z.string()).optional().describe("Only run these rules"),
  excludes: EXCLUDES,
  testPaths: TEST_PATHS,
  profile: z
    .enum(["advisory", "default", "strict"])
    .optional()
    .describe("Advisory profile; default and strict are compatibility aliases"),
};

async function qualityScan(input: ScanRequest) {
  try {
    const { report } = await runScanAsync({
      ...input,
      root: requireRepositoryRoot(input.root),
    });
    return text(JSON.stringify(report, null, 2));
  } catch (err) {
    return toolError(err);
  }
}
