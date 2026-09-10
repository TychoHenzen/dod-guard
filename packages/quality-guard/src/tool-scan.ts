import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runScan, type ScanRequest } from "./scanner.js";
import { text, toolError } from "./tool-response.js";
import { EXCLUDES, PATHS, ROOT, TEST_PATHS } from "./tool-schemas.js";
import { z } from "zod";

export function registerQualityScan(server: McpServer): void {
  server.tool(
    "quality_scan",
    QUALITY_SCAN_DESCRIPTION,
    QUALITY_SCAN_INPUT,
    qualityScan,
  );
}

const QUALITY_SCAN_DESCRIPTION =
  "Measure structural quality of the given paths and return the raw report. " +
  "No verdict, no baseline. Use quality_gate to decide pass or fail.";

const QUALITY_SCAN_INPUT = {
  paths: PATHS,
  root: ROOT,
  rules: z.array(z.string()).optional().describe("Only run these rules"),
  excludes: EXCLUDES,
  testPaths: TEST_PATHS,
  profile: z.enum(["default", "strict"]).optional(),
};

async function qualityScan(input: ScanRequest) {
  try {
    const { report } = runScan(input);
    return text(JSON.stringify(report, null, 2));
  } catch (err) {
    return toolError(err);
  }
}

const QUALITY_GATE_INPUT = {
  paths: PATHS,
  baseline: z
    .string()
    .describe(
      "Path to the baseline, normally .github/quality/quality-baseline.json",
    ),
  root: ROOT,
  rules: z.array(z.string()).optional(),
  excludes: EXCLUDES,
  testPaths: TEST_PATHS,
  failOn: z
    .enum(["none", "error", "regression", "any"])
    .optional()
    .describe("Default regression"),
};

async function qualityGate(input: ScanRequest) {
  try {
    const result = runGateScan(input);
    const verdict = result.exitCode === 0 ? "PASS" : "FAIL";
    return text(
      `${verdict} (exit ${result.exitCode})\n\n` +
        JSON.stringify(result.report, null, 2),
    );
  } catch (err) {
    return toolError(err);
  }
}

function runGateScan(input: ScanRequest) {
  return runScan({
    ...input,
    failOn: input.failOn ?? "regression",
  });
}

export function registerQualityGate(server: McpServer): void {
  server.tool(
    "quality_gate",
    "Compare the given paths against a recorded baseline and report " +
      "regressions. Existing debt is allowed, making it worse is not. A file " +
      "the baseline has never seen is adopted rather than failed.",
    QUALITY_GATE_INPUT,
    qualityGate,
  );
}
