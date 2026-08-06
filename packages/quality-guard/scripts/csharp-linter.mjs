/**
 * dotnet format analyzers findings for one C# file, checked against the
 * whole solution or project it belongs to.
 *
 * `dotnet format analyzers --verify-no-changes` runs the Roslyn 3rd-party
 * analyzers, not the whitespace formatter, so running it here does not
 * violate this file family's rule that formatters stay out. It has no
 * single-file mode, so this module shares rust-linter.mjs's longer timeout
 * and only ever runs when the repository has a .sln or .csproj file.
 *
 * The command writes its findings to a JSON report file rather than stdout,
 * so this module points `--report` at a throwaway temp directory, reads the
 * report back, and always cleans the directory up.
 *
 * `spawn` mirrors node:child_process's spawnSync so a test can stub the
 * dotnet invocation directly, without a module-mock flag. Because the
 * report lives on disk rather than in the stub's return value, a test stub
 * drives the parser by writing a fake report to the `--report` path it was
 * given, the same place a real `dotnet format` run would write one.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WHOLE_PROJECT_TIMEOUT_MS as TIMEOUT_MS } from './linter-timeout.mjs';

const REPORT_FILE = 'format-report.json';
const SEVERITY_PREFIX = /^(\w+)\s+\S+:\s*/;

/** Whether the repository root itself holds a solution or project file. */
function hasProjectOrSolution(repoRoot) {
  return readdirSync(repoRoot).some((name) => name.endsWith('.sln') || name.endsWith('.csproj'));
}

function run(spawn, reportDir, cwd) {
  spawn('dotnet', ['format', 'analyzers', '--verify-no-changes', '--report', reportDir], {
    cwd, encoding: 'utf8', timeout: TIMEOUT_MS, shell: false,
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A path, resolved against the repository root, with backslashes normalised. */
function normalizedPath(repoRoot, candidate) {
  return resolve(repoRoot, candidate).replace(/\\/g, '/');
}

/**
 * The plain message text of an error-level diagnostic, or null when the
 * change is not error-level. `FormatDescription` reads like
 * `error CA1822: Member 'Helper' does not access instance data...`, with no
 * severity field of its own to check instead.
 */
function errorMessage(formatDescription) {
  const match = SEVERITY_PREFIX.exec(formatDescription || '');
  if (!match || match[1].toLowerCase() !== 'error') return null;
  return formatDescription.slice(match[0].length);
}

/** One report entry's error-level findings, when the entry names the target file. */
function findingsInFile(entry, target, repoRoot) {
  if (normalizedPath(repoRoot, entry.FilePath || entry.FileName || '') !== target) return [];
  return (entry.FileChanges || []).flatMap((change) => {
    const message = errorMessage(change.FormatDescription);
    if (!message || !change.LineNumber) return [];
    return [{ line: change.LineNumber, rule: change.DiagnosticId || 'dotnet-format', message }];
  });
}

/** Error-level dotnet format analyzers diagnostics on the edited file. */
function reportFindings(report, filePath, repoRoot) {
  if (!Array.isArray(report)) return [];
  const target = normalizedPath(repoRoot, filePath);
  return report.flatMap((entry) => findingsInFile(entry, target, repoRoot));
}

/**
 * dotnet format analyzers, only when the repository has a solution or
 * project file. Fails open: a timeout, a missing dotnet binary, or a
 * missing or unparsable report all read the same as the analyzers finding
 * nothing.
 */
export function csharpFindings(filePath, repoRoot, spawn = spawnSync) {
  if (!hasProjectOrSolution(repoRoot)) return [];
  const reportDir = mkdtempSync(join(tmpdir(), 'qg-csharp-'));
  try {
    run(spawn, reportDir, repoRoot);
    const report = parseJson(readFileSync(join(reportDir, REPORT_FILE), 'utf8'));
    return reportFindings(report, filePath, repoRoot);
  } catch {
    return [];
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}
