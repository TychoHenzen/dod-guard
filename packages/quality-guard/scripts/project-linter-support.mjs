import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT_MS = 10_000;

export function linterResult(findings = []) {
  return { findings, unavailable: null };
}

export function linterUnavailable(detail) {
  return { findings: [], unavailable: detail };
}

export const ESLINT_EXT = new Set(
  ".ts,.tsx,.mts,.cts,.js,.jsx,.mjs,.cjs".split(","),
);
const ESLINT_CONFIGS = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
];
const RUFF_CONFIGS = ["ruff.toml", ".ruff.toml", "pyproject.toml"];

function hasAny(repoRoot, names) {
  return names.some((name) => existsSync(join(repoRoot, name)));
}

function firstExisting(paths) {
  return paths.find((path) => existsSync(path)) || null;
}

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
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

function eslintMessages(filePath, repoRoot) {
  if (!hasAny(repoRoot, ESLINT_CONFIGS)) return linterResult();
  const binary = firstExisting([
    join(repoRoot, "node_modules", ".bin", "eslint.cmd"),
    join(repoRoot, "node_modules", ".bin", "eslint"),
  ]);
  if (!binary) return linterUnavailable("eslint executable is not installed.");
  const result = run(binary, ["--format=json", filePath], repoRoot);
  if (result.error)
    return linterUnavailable(`eslint failed: ${result.error.message}`);
  const parsed = parseJson(result.stdout || "");
  if (parsed === null)
    return linterUnavailable("eslint returned malformed JSON.");
  return linterResult(parsed);
}

function eslintFinding(message) {
  if (message.severity !== 2 || !message.line) return [];
  return [
    {
      line: message.line,
      rule: message.ruleId || "eslint",
      message: message.message,
    },
  ];
}

/** ESLint, only from a binary already installed in the repository. */
export function eslintFindings(filePath, repoRoot) {
  const result = eslintMessages(filePath, repoRoot);
  if (result.unavailable) return result;
  if (!Array.isArray(result.findings))
    return linterUnavailable("eslint returned an unexpected result.");
  return linterResult(
    result.findings.flatMap((file) =>
      (file.messages || []).flatMap(eslintFinding),
    ),
  );
}

/** Ruff, only when the repository configures it. */
export function ruffFindings(filePath, repoRoot) {
  if (!hasAny(repoRoot, RUFF_CONFIGS)) return linterResult();
  const result = run(
    "ruff",
    ["check", "--output-format=json", filePath],
    repoRoot,
  );
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
