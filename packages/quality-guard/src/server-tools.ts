import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerQualityReport } from "./tool-report.js";
import { registerQualityScan } from "./tool-scan.js";
import { registerQualityTestQuality } from "./tool-test-quality.js";

export function registerQualityGuardTools(server: McpServer): void {
  registerQualityScan(server);
  registerQualityReport(server);
  registerQualityTestQuality(server);
}
