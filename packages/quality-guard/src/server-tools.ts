import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerQualityReport, registerQualitySkips } from "./tool-report.js";
import { registerQualityGate, registerQualityScan } from "./tool-scan.js";
import { registerQualityTestQuality } from "./tool-test-quality.js";

type QualityToolSurface = "advisory" | "legacy";

export function registerQualityGuardTools(
  server: McpServer,
  surface: QualityToolSurface = "advisory",
): void {
  registerQualityScan(server);
  registerQualityReport(server);
  registerQualityTestQuality(server);
  if (surface !== "legacy") return;
  registerQualityGate(server);
  registerQualitySkips(server);
}
