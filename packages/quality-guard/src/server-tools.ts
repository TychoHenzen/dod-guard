import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerQualityCommitGate } from "./tool-commit.js";
import { registerQualityGate, registerQualityScan } from "./tool-scan.js";
import { registerQualityReport, registerQualitySkips } from "./tool-report.js";

export function registerQualityGuardTools(server: McpServer): void {
  registerQualityScan(server);
  registerQualityGate(server);
  registerQualityReport(server);
  registerQualitySkips(server);
  registerQualityCommitGate(server);
}
