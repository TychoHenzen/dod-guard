import type { DecisionResult } from "./types.js";

type ScannerViolation = {
  file: string;
  line: number;
  rule: string;
  severity: string;
  message: string;
  suggestion?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isScannerViolation(value: unknown): value is ScannerViolation {
  if (!isRecord(value)) return false;
  const strings = [value.file, value.rule, value.severity, value.message];
  return (
    strings.every((field) => typeof field === "string") &&
    typeof value.line === "number" &&
    (value.suggestion === undefined || typeof value.suggestion === "string")
  );
}

function reportFor(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.violations)) return undefined;
  const comparison = value.comparison;
  if (!isRecord(comparison) || !Array.isArray(comparison.regressions))
    return undefined;
  return {
    violations: value.violations as unknown[],
    regressions: comparison.regressions as unknown[],
  };
}

function regressionKey(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.file !== "string" || typeof value.rule !== "string")
    return undefined;
  return `${value.file}\0${value.rule}`;
}

function violationLines(
  value: unknown,
  regressed: Set<string>,
): string[] {
  if (!isScannerViolation(value)) return [];
  if (!regressed.has(`${value.file}\0${value.rule}`)) return [];
  const lines = [
    `SCANNER: ${value.severity.toUpperCase()} ` +
      `${value.file}:${value.line} ${value.rule}: ${value.message}`,
  ];
  if (value.suggestion) lines.push(`  Suggestion: ${value.suggestion}`);
  return lines;
}

function scannerLinesFor(value: unknown): string[] {
  const report = reportFor(value);
  if (!report) return [];
  const regressed = new Set(
    report.regressions.flatMap((regression) => {
      const key = regressionKey(regression);
      return key === undefined ? [] : [key];
    }),
  );
  return report.violations.flatMap((violation) =>
    violationLines(violation, regressed),
  );
}

export function scannerLines(result: DecisionResult): string[] {
  return result.findings.flatMap((finding) =>
    scannerLinesFor(finding.after.report),
  );
}
