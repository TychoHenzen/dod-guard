import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerQualityCommitGate } from "./tool-commit.js";
import { registerQualityReport, registerQualitySkips } from "./tool-report.js";
import { registerQualityGate, registerQualityScan } from "./tool-scan.js";

export function registerQualityGuardTools(server: McpServer): void {
  registerQualityScan(server);
  registerQualityGate(server);
  registerQualityReport(server);
  registerQualitySkips(server);
  registerQualityCommitGate(server);
}
