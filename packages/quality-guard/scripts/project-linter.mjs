/**
 * Run the linter the repository already configures, for the one edited file.
 *
 * ESLint and ruff are per-file linters inside the shared ten-second timeout.
 * Clippy and dotnet format analyzers need the whole crate, project, or
 * solution, so Rust and C# get their own module with a longer shared timeout
 * (rust-linter.mjs, csharp-linter.mjs). `dotnet format analyzers` runs the
 * Roslyn analyzers, not the whitespace formatter, so it stays in scope.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { rustFindings } from './rust-linter.mjs';
import { csharpFindings } from './csharp-linter.mjs';

const TIMEOUT_MS = 10_000;

const ESLINT_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const ESLINT_CONFIGS = [
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
];
const RUFF_CONFIGS = ['ruff.toml', '.ruff.toml', 'pyproject.toml'];

function hasAny(repoRoot, names) {
  return names.some((name) => existsSync(join(repoRoot, name)));
}

function firstExisting(paths) {
  return paths.find((path) => existsSync(path)) || null;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: TIMEOUT_MS, shell: false,
  });
  return result.stdout || '';
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** ESLint, only from a binary already installed in the repository. */
function eslintFindings(filePath, repoRoot) {
  if (!hasAny(repoRoot, ESLINT_CONFIGS)) return [];
  const binary = firstExisting([
    join(repoRoot, 'node_modules', '.bin', 'eslint.cmd'),
    join(repoRoot, 'node_modules', '.bin', 'eslint'),
  ]);
  if (!binary) return [];

  const parsed = parseJson(run(binary, ['--format=json', filePath], repoRoot));
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((file) => (file.messages || [])
    .filter((message) => message.severity === 2 && message.line)
    .map((message) => ({
      line: message.line,
      rule: message.ruleId || 'eslint',
      message: message.message,
    })));
}

/** Ruff, only when the repository configures it. */
function ruffFindings(filePath, repoRoot) {
  if (!hasAny(repoRoot, RUFF_CONFIGS)) return [];
  const parsed = parseJson(run('ruff', ['check', '--output-format=json', filePath], repoRoot));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item.location?.row)
    .map((item) => ({
      line: item.location.row,
      rule: item.code || 'ruff',
      message: item.message,
    }));
}

/** Extension test paired with its finder, tried in order. */
const LINTERS = [
  [(lower) => ESLINT_EXT.has(lower.slice(lower.lastIndexOf('.'))), eslintFindings],
  [(lower) => lower.endsWith('.py'), ruffFindings],
  [(lower) => lower.endsWith('.rs'), rustFindings],
  [(lower) => lower.endsWith('.cs'), csharpFindings],
];

/** Findings from the repository linter that matches this file. */
export function runProjectLinter(filePath, repoRoot) {
  const lower = filePath.toLowerCase();
  try {
    return LINTERS.find(([test]) => test(lower))?.[1]?.(filePath, repoRoot) ?? [];
  } catch {
    return [];
  }
}
