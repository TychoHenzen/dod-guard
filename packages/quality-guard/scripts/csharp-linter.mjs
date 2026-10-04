import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WHOLE_PROJECT_TIMEOUT_MS as TIMEOUT_MS } from "./linter-timeout.mjs";
import { formatCsharpResult } from "./csharp-linter-result.mjs";

function hasProjectOrSolution(repoRoot) {
  return readdirSync(repoRoot).some(
    (name) => name.endsWith(".sln") || name.endsWith(".csproj"),
  );
}

function run(spawn, reportDir, cwd) {
  try {
    return spawn(
      "dotnet",
      ["format", "analyzers", "--verify-no-changes", "--report", reportDir],
      {
        cwd,
        encoding: "utf8",
        timeout: TIMEOUT_MS,
        shell: false,
      },
    );
  } catch (error) {
    return { error };
  }
}

export function csharpFindings(filePath, repoRoot, spawn = spawnSync) {
  if (!hasProjectOrSolution(repoRoot))
    return { findings: [], unavailable: null };
  const reportDir = mkdtempSync(join(tmpdir(), "qg-csharp-"));
  try {
    return formatCsharpResult(
      run(spawn, reportDir, repoRoot),
      reportDir,
      filePath,
      repoRoot,
    );
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}
