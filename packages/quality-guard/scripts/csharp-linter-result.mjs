import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { linterResult, linterUnavailable } from "./project-linter-result.mjs";

const REPORT_FILE = "format-report.json";
const SEVERITY_PREFIX = /^(\w+)\s+\S+:\s*/;

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

function findingForChange(change) {
  const match = SEVERITY_PREFIX.exec(change.FormatDescription || "");
  if (!match || match[1].toLowerCase() !== "error" || !change.LineNumber)
    return [];
  return [
    {
      line: change.LineNumber,
      rule: change.DiagnosticId || "dotnet-format",
      message: change.FormatDescription.slice(match[0].length),
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
  const target = normalizedPath(repoRoot, filePath);
  return report.flatMap((entry) => findingsInFile(entry, target, repoRoot));
}

export function formatCsharpResult(result, reportDir, filePath, repoRoot) {
  if (result?.error)
    return linterUnavailable(`dotnet format failed: ${result.error.message}`);
  try {
    const report = parseJson(
      readFileSync(join(reportDir, REPORT_FILE), "utf8"),
    );
    if (!Array.isArray(report))
      return linterUnavailable("dotnet format returned malformed JSON output.");
    return linterResult(reportFindings(report, filePath, repoRoot));
  } catch (error) {
    return linterUnavailable(
      `dotnet format failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
