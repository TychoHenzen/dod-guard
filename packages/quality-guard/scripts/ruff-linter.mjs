import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WHOLE_PROJECT_TIMEOUT_MS as TIMEOUT_MS } from "./linter-timeout.mjs";
import { linterResult, linterUnavailable } from "./project-linter-result.mjs";

const RUFF_CONFIGS = ["ruff.toml", ".ruff.toml", "pyproject.toml"];

function configured(repoRoot) {
  return RUFF_CONFIGS.some((name) => existsSync(join(repoRoot, name)));
}

function run(repoRoot, filePath) {
  return spawnSync("ruff", ["check", "--output-format=json", filePath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    shell: false,
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseResult(result) {
  if (result.error)
    return linterUnavailable(`ruff failed: ${result.error.message}`);
  const parsed = parseJson(result.stdout || "");
  if (parsed === null)
    return linterUnavailable("ruff returned malformed JSON.");
  if (!Array.isArray(parsed))
    return linterUnavailable("ruff returned an unexpected result.");
  return linterResult(
    parsed
      .filter((item) => item.location?.row)
      .map((item) => ({
        line: item.location.row,
        rule: item.code || "ruff",
        message: item.message,
      })),
  );
}

export function ruffFindings(filePath, repoRoot) {
  if (!configured(repoRoot)) return linterResult();
  return parseResult(run(repoRoot, filePath));
}
