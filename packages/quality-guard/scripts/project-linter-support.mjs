import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT_MS = 10_000;

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
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    shell: false,
  });
  return result.stdout || "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function eslintMessages(filePath, repoRoot) {
  if (!hasAny(repoRoot, ESLINT_CONFIGS)) return [];
  const binary = firstExisting([
    join(repoRoot, "node_modules", ".bin", "eslint.cmd"),
    join(repoRoot, "node_modules", ".bin", "eslint"),
  ]);
  if (!binary) return [];
  return parseJson(run(binary, ["--format=json", filePath], repoRoot));
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
  const parsed = eslintMessages(filePath, repoRoot);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((file) => (file.messages || []).flatMap(eslintFinding));
}

/** Ruff, only when the repository configures it. */
export function ruffFindings(filePath, repoRoot) {
  if (!hasAny(repoRoot, RUFF_CONFIGS)) return [];
  const parsed = parseJson(
    run("ruff", ["check", "--output-format=json", filePath], repoRoot),
  );
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item.location?.row)
    .map((item) => ({
      line: item.location.row,
      rule: item.code || "ruff",
      message: item.message,
    }));
}
