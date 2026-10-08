import { requireSeverity } from "#quality-guard-severity";
import { reportSummaries } from "./report-summaries.js";

const FILE_SELECTION =
  "supported handwritten source; generated, dependency, build, binary, " +
  "unreadable, and symlinked files excluded";

function scoring() {
  return {
    initial: 100,
    highDeduction: 5,
    mediumDeduction: 1,
    lowDeduction: 0,
    minimum: 0,
  };
}

type ScanInput = {
  profile: "advisory" | "default" | "strict";
  files: Array<{
    path: string;
    language: string;
    classification: "production" | "test";
  }>;
  violations: Array<{
    file: string;
    line: number;
    rule: string;
    severity: ReturnType<typeof requireSeverity>;
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
      const findings = [...(byFile.get(file.path) ?? [])]
        .map((finding) => ({
          ...finding,
          severity: requireSeverity(finding.severity),
        }))
        .sort(compareFinding);
      const high = findings.filter(
        (finding) => finding.severity === "high",
      ).length;
      const medium = findings.filter(
        (finding) => finding.severity === "medium",
      ).length;
      const low = findings.filter(
        (finding) => finding.severity === "low",
      ).length;
      return {
        ...file,
        score: Math.max(0, 100 - high * 5 - medium),
        high,
        medium,
        low,
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
    configurableData?: unknown[];
    transitiveNavigation?: unknown[];
    errors: Array<{ code: string; target: string; message: string }>;
  },
) {
  const files = scoredFiles(scan, findingsByFile(scan));
  return {
    schemaVersion: 1,
    scoring: scoring(),
    scanner: {
      profile: "advisory",
      fileSelection: FILE_SELECTION,
    },
    summaries: reportSummaries(files),
    files,
    architecture,
  };
}
