import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { analyzeTestQuality } from "./analyze.js";
import { emptyMetrics } from "./metrics.js";

const DEFAULT_TEST_QUALITY_EVIDENCE = ".quality/test-quality.json";

function emptyReport(
  status: "ok" | "invalid",
  evidencePath: string,
  errors: string[],
) {
  return {
    schemaVersion: 1,
    status,
    evidencePath,
    errors,
    findings: [],
    metrics: emptyMetrics(),
  };
}

function readReport(absolutePath: string, evidencePath: string) {
  try {
    return {
      ...analyzeTestQuality(JSON.parse(readFileSync(absolutePath, "utf8"))),
      evidencePath,
    };
  } catch (error) {
    return emptyReport("invalid", evidencePath, [
      `could not read evidence: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}

function rootFor(input: { root?: string }) {
  return path.resolve(input.root ?? process.cwd());
}

function evidenceFor(input: { evidence?: string }) {
  return input.evidence ?? DEFAULT_TEST_QUALITY_EVIDENCE;
}

function relativeFor(root: string, absolutePath: string) {
  return path.relative(root, absolutePath) || ".";
}

function pathsFor(input: { root?: string; evidence?: string }) {
  const root = rootFor(input);
  const evidencePath = evidenceFor(input);
  const absolutePath = path.resolve(root, evidencePath);
  return {
    absolutePath,
    relativePath: relativeFor(root, absolutePath),
  };
}

export function runTestQualityReport(input: {
  root?: string;
  evidence?: string;
}) {
  const { absolutePath, relativePath } = pathsFor(input);
  if (!existsSync(absolutePath))
    return emptyReport("ok", relativePath, [
      `evidence file not found: ${relativePath}`,
    ]);
  return readReport(absolutePath, relativePath);
}
