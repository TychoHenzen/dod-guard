import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rustFindings } from "./rust-linter.mjs";
import { csharpFindings } from "./csharp-linter.mjs";
import {
  ESLINT_EXT,
  eslintFindings,
  linterResult,
  linterUnavailable,
} from "./project-linter-support.mjs";
import { WHOLE_PROJECT_TIMEOUT_MS as TIMEOUT_MS } from "./linter-timeout.mjs";

const RUFF_CONFIGS = ["ruff.toml", ".ruff.toml", "pyproject.toml"];

function runRuff(filePath, repoRoot) {
  try {
    return spawnSync("ruff", ["check", "--output-format=json", filePath], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: TIMEOUT_MS,
      shell: false,
    });
  } catch (error) {
    return { error };
  }
}

function parseRuffJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseRuffResult(result) {
  if (result.error)
    return linterUnavailable(`ruff failed: ${result.error.message}`);
  const findings = parseRuffJson(result.stdout || "");
  if (!Array.isArray(findings))
    return linterUnavailable("ruff returned an unexpected result.");
  return linterResult(
    findings
      .filter((item) => item.location?.row)
      .map((item) => ({
        line: item.location.row,
        rule: item.code || "ruff",
        message: item.message,
      })),
  );
}

function ruffFindings(filePath, repoRoot) {
  if (!RUFF_CONFIGS.some((name) => existsSync(join(repoRoot, name))))
    return linterResult();
  return parseRuffResult(runRuff(filePath, repoRoot));
}

/** Extension test paired with its finder, tried in order. */
const LINTERS = [
  [
    (lower) => ESLINT_EXT.has(lower.slice(lower.lastIndexOf("."))),
    eslintFindings,
  ],
  [(lower) => lower.endsWith(".py"), ruffFindings],
  [(lower) => lower.endsWith(".rs"), rustFindings],
  [(lower) => lower.endsWith(".cs"), csharpFindings],
];

/** Findings from the repository linter that matches this file. */
export function runProjectLinter(filePath, repoRoot) {
  const lower = filePath.toLowerCase();
  const linter = LINTERS.find(([test]) => test(lower))?.[1];
  if (!linter) return linterResult();
  try {
    const result = linter(filePath, repoRoot);
    return Array.isArray(result) ? linterResult(result) : result;
  } catch (error) {
    return linterUnavailable(
      `project linter failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
