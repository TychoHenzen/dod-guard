import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WHOLE_PROJECT_TIMEOUT_MS as TIMEOUT_MS } from "./linter-timeout.mjs";

const REPORT_FILE = "format-report.json";
const SEVERITY_PREFIX = /^(\w+)\s+\S+:\s*/;

function hasProjectOrSolution(repoRoot) {
  return readdirSync(repoRoot).some(
    (name) => name.endsWith(".sln") || name.endsWith(".csproj"),
  );
}

function run(spawn, reportDir, cwd) {
  spawn(
    "dotnet",
    ["format", "analyzers", "--verify-no-changes", "--report", reportDir],
    {
      cwd,
      encoding: "utf8",
      timeout: TIMEOUT_MS,
      shell: false,
    },
  );
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizedPath(repoRoot, candidate) {
  return resolve(repoRoot, candidate).replace(/\\/g, "/");
}

function errorMessage(formatDescription) {
  const match = SEVERITY_PREFIX.exec(formatDescription || "");
  if (!match || match[1].toLowerCase() !== "error") return null;
  return formatDescription.slice(match[0].length);
}

function findingForChange(change) {
  const message = errorMessage(change.FormatDescription);
  if (!message || !change.LineNumber) return [];
  return [
    {
      line: change.LineNumber,
      rule: change.DiagnosticId || "dotnet-format",
      message,
    },
  ];
}

function findingsInFile(entry, target, repoRoot) {
  if (
    normalizedPath(repoRoot, entry.FilePath || entry.FileName || "") !== target
  )
    return [];
  return (entry.FileChanges || []).flatMap(findingForChange);
}

function reportFindings(report, filePath, repoRoot) {
  if (!Array.isArray(report)) return [];
  const target = normalizedPath(repoRoot, filePath);
  return report.flatMap((entry) => findingsInFile(entry, target, repoRoot));
}

export function csharpFindings(filePath, repoRoot, spawn = spawnSync) {
  if (!hasProjectOrSolution(repoRoot)) return [];
  const reportDir = mkdtempSync(join(tmpdir(), "qg-csharp-"));
  try {
    run(spawn, reportDir, repoRoot);
    const report = parseJson(
      readFileSync(join(reportDir, REPORT_FILE), "utf8"),
    );
    return reportFindings(report, filePath, repoRoot);
  } catch {
    return [];
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}
