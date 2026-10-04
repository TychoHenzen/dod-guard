import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WHOLE_PROJECT_TIMEOUT_MS as TIMEOUT_MS } from "./linter-timeout.mjs";
import { linterResult, linterUnavailable } from "./project-linter-support.mjs";
const REPORT_FILE = "format-report.json";
const SEVERITY_PREFIX = /^(\w+)\s+\S+:\s*/;
const FORMAT_ARGS = ["format", "analyzers", "--verify-no-changes", "--report"];
const DOTNET_OPTIONS = { encoding: "utf8", timeout: TIMEOUT_MS, shell: false };

const hasProjectOrSolution = (repoRoot) =>
  readdirSync(repoRoot).some(
    (name) => name.endsWith(".sln") || name.endsWith(".csproj"),
  );

function run(spawn, reportDir, cwd) {
  try {
    return spawn("dotnet", [...FORMAT_ARGS, reportDir], {
      ...DOTNET_OPTIONS,
      cwd,
    });
  } catch (error) {
    return { error };
  }
}

function normalizedPath(repoRoot, candidate) {
  return resolve(repoRoot, candidate).replace(/\\/g, "/");
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

function formatCsharpResult(result, reportDir, context) {
  if (result?.error)
    return linterUnavailable(`dotnet format failed: ${result.error.message}`);
  try {
    const report = parseJson(
      readFileSync(join(reportDir, REPORT_FILE), "utf8"),
    );
    if (!Array.isArray(report))
      return linterUnavailable("dotnet format returned malformed JSON output.");
    const target = normalizedPath(context.repoRoot, context.filePath);
    return linterResult(
      report.flatMap((entry) =>
        findingsInFile(entry, target, context.repoRoot),
      ),
    );
  } catch (error) {
    return linterUnavailable(
      `dotnet format failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function csharpFindings(filePath, repoRoot, spawn = spawnSync) {
  if (!hasProjectOrSolution(repoRoot)) return linterResult();
  const reportDir = mkdtempSync(join(tmpdir(), "qg-csharp-"));
  try {
    return formatCsharpResult(run(spawn, reportDir, repoRoot), reportDir, {
      filePath,
      repoRoot,
    });
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}
