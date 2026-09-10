import { reportSummaries } from "./report-summaries.js";

type ScanInput = {
  profile: "default" | "strict";
  files: Array<{
    path: string;
    language: string;
    classification: "production" | "test";
  }>;
  violations: Array<{
    file: string;
    line: number;
    rule: string;
    severity: "error" | "warn";
    message: string;
    [key: string]: unknown;
  }>;
};

function compareFinding(
  left: ScanInput["violations"][number],
  right: ScanInput["violations"][number],
): number {
  return (
    left.line - right.line ||
    left.rule.localeCompare(right.rule) ||
    left.message.localeCompare(right.message)
  );
}

function findingsByFile(scan: ScanInput): Map<string, ScanInput["violations"]> {
  const byFile = new Map<string, ScanInput["violations"]>();
  for (const finding of scan.violations)
    byFile.set(finding.file, [...(byFile.get(finding.file) ?? []), finding]);
  return byFile;
}

function scoredFiles(
  scan: ScanInput,
  byFile: Map<string, ScanInput["violations"]>,
) {
  return [...scan.files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => {
      const findings = [...(byFile.get(file.path) ?? [])].sort(compareFinding);
      const errors = findings.filter(
        (finding) => finding.severity === "error",
      ).length;
      const warnings = findings.length - errors;
      return {
        ...file,
        score: Math.max(0, 100 - errors * 5 - warnings),
        errors,
        warnings,
        findings,
      };
    });
}

export function buildQualityReport(
  scan: ScanInput,
  architecture: {
    placement: unknown[];
    dependencies: unknown[];
    cycles: unknown[];
    encapsulation: unknown[];
    errors: Array<{ code: string; target: string; message: string }>;
  },
) {
  const files = scoredFiles(scan, findingsByFile(scan));
  return {
    schemaVersion: 1,
    scoring: {
      initial: 100,
      errorDeduction: 5,
      warningDeduction: 1,
      minimum: 0,
    },
    scanner: {
      profile: scan.profile,
      fileSelection:
        "supported handwritten source; generated, dependency, build, binary, " +
        "unreadable, and symlinked files excluded",
    },
    summaries: reportSummaries(files),
    files,
    architecture,
  };
}
