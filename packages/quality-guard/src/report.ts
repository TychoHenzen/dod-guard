import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { parseQualityConfig } from "./commit-gate/config.js";
import { analyzeCurrentArchitecture } from "./commit-gate/current-architecture.js";
import { extractFactInventory } from "./commit-gate/facts.js";
import { runScan, type ScanRequest } from "./scanner.js";

type Classification = "production" | "test";
type Severity = "error" | "warn";

export interface ScanFinding {
  file: string;
  line: number;
  rule: string;
  severity: Severity;
  message: string;
  [key: string]: unknown;
}

export interface ScanFile {
  path: string;
  language: string;
  classification: Classification;
}

export interface ReportScan {
  profile: "default" | "strict";
  files: ScanFile[];
  violations: ScanFinding[];
}

export interface ArchitectureReport {
  placement: unknown[];
  dependencies: unknown[];
  cycles: unknown[];
  encapsulation: unknown[];
  errors: Array<{ code: string; target: string; message: string }>;
}

function compareFinding(left: ScanFinding, right: ScanFinding): number {
  return left.line - right.line || left.rule.localeCompare(right.rule) || left.message.localeCompare(right.message);
}

function summarize(files: QualityFile[]) {
  const fileCount = files.length;
  const errors = files.reduce((sum, file) => sum + file.errors, 0);
  const warnings = files.reduce((sum, file) => sum + file.warnings, 0);
  const averageScore = fileCount === 0 ? null : files.reduce((sum, file) => sum + file.score, 0) / fileCount;
  const minimumScore = fileCount === 0 ? null : Math.min(...files.map((file) => file.score));
  return { fileCount, errors, warnings, averageScore, minimumScore };
}

interface QualityFile extends ScanFile {
  score: number;
  errors: number;
  warnings: number;
  findings: ScanFinding[];
}

export function buildQualityReport(scan: ReportScan, architecture: ArchitectureReport) {
  const byFile = new Map<string, ScanFinding[]>();
  for (const finding of scan.violations) {
    const findings = byFile.get(finding.file) ?? [];
    findings.push(finding);
    byFile.set(finding.file, findings);
  }
  const files: QualityFile[] = [...scan.files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => {
      const findings = [...(byFile.get(file.path) ?? [])].sort(compareFinding);
      const errors = findings.filter((finding) => finding.severity === "error").length;
      const warnings = findings.length - errors;
      return { ...file, score: Math.max(0, 100 - errors * 5 - warnings), errors, warnings, findings };
    });
  const production = files.filter((file) => file.classification === "production");
  const tests = files.filter((file) => file.classification === "test");
  return {
    schemaVersion: 1,
    scoring: { initial: 100, errorDeduction: 5, warningDeduction: 1, minimum: 0 },
    scanner: {
      profile: scan.profile,
      fileSelection:
        "supported handwritten source; generated, dependency, build, binary, unreadable, and symlinked files excluded",
    },
    summaries: { overall: summarize(files), production: summarize(production), test: summarize(tests) },
    files,
    architecture,
  };
}

function architectureFor(root: string, scan: ReportScan): ArchitectureReport {
  const configPath = path.join(root, ".quality-guard.json");
  const config = parseQualityConfig(existsSync(configPath) ? readFileSync(configPath, "utf8") : "{}");
  const sourceFiles = scan.files.map((file) => ({
    path: file.path,
    content: readFileSync(path.join(root, file.path), "utf8"),
  }));
  const inventory = extractFactInventory(
    sourceFiles,
    sourceFiles.map((file) => file.path),
  );
  const analyzed = analyzeCurrentArchitecture(inventory.files, config);
  return {
    ...analyzed,
    errors: inventory.errors.map((message) => {
      const separator = message.indexOf(": ");
      return {
        code: "ARCHITECTURE_EXTRACTION_FAILED",
        target: separator === -1 ? "" : message.slice(0, separator),
        message: separator === -1 ? message : message.slice(separator + 2),
      };
    }),
  };
}

function asReportScan(report: unknown): ReportScan {
  const candidate = report as Partial<ReportScan>;
  if (!(Array.isArray(candidate.files) && Array.isArray(candidate.violations) && candidate.profile)) {
    throw new Error("quality scanner returned an invalid report");
  }
  return candidate as ReportScan;
}

export function runQualityReport(request: Omit<ScanRequest, "paths"> & { root?: string }) {
  const root = path.resolve(request.root ?? process.cwd());
  const scan = asReportScan(runScan({ ...request, root, paths: ["."] }).report);
  return buildQualityReport(scan, architectureFor(root, scan));
}
