import { requireSeverity } from "#quality-guard-severity";
import { reportSummaries, severityCounts } from "./report-summaries.js";

const FILE_SELECTION =
  "supported handwritten source; generated, dependency, build, binary, " +
  "unreadable, and symlinked files excluded";

const SCORING = {
  initial: 100,
  highDeduction: 5,
  mediumDeduction: 1,
  lowDeduction: 0,
  minimum: 0,
} as const;

function scoring() {
  return { ...SCORING };
}

function fileScore(counts: {
  high: number;
  medium: number;
  low: number;
}): number {
  return Math.max(
    SCORING.minimum,
    SCORING.initial -
      counts.high * SCORING.highDeduction -
      counts.medium * SCORING.mediumDeduction -
      counts.low * SCORING.lowDeduction,
  );
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

function normalizedFindings(scan: ScanInput): ScanInput["violations"] {
  return scan.violations.map((finding) => ({
    ...finding,
    severity: requireSeverity(finding.severity),
  }));
}

function findingsByFile(
  findings: ScanInput["violations"],
): Map<string, ScanInput["violations"]> {
  const byFile = new Map<string, ScanInput["violations"]>();
  for (const finding of findings)
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
      const counts = severityCounts(findings);
      return {
        ...file,
        score: fileScore(counts),
        ...counts,
        findings,
      };
    });
}

function projectFindings(
  scan: ScanInput,
  findings: ScanInput["violations"],
): ScanInput["violations"] {
  const scanned = new Set(scan.files.map((file) => file.path));
  return findings
    .filter((finding) => !scanned.has(finding.file))
    .sort(
      (left, right) =>
        left.file.localeCompare(right.file) || compareFinding(left, right),
    );
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
  const findings = normalizedFindings(scan);
  const files = scoredFiles(scan, findingsByFile(findings));
  const project = projectFindings(scan, findings);
  return {
    schemaVersion: 1,
    scoring: scoring(),
    scanner: {
      profile: "advisory",
      fileSelection: FILE_SELECTION,
    },
    summaries: reportSummaries(files, project),
    files,
    projectFindings: project,
    architecture,
  };
}
