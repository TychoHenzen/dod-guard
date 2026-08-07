#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

export const LANG_CHECKERS = {
  js: { cmd: "node", args: (f) => ["--check", f] },
  mjs: { cmd: "node", args: (f) => ["--check", f] },
  cjs: { cmd: "node", args: (f) => ["--check", f] },
  jsx: { cmd: "node", args: (f) => ["--check", f] },
  ts: { cmd: "npx", args: (f) => ["tsc", "--noEmit", f] },
  tsx: { cmd: "npx", args: (f) => ["tsc", "--noEmit", f] },
  py: {
    cmd: "python",
    args: (f) => ["-c", `import py_compile; py_compile.compile(${JSON.stringify(f)})`],
  },
};

/**
 * Detect the language of a file from its extension.
 */
export function detectLanguage(filePath) {
  const ext = extname(filePath).slice(1).toLowerCase();
  return ext || "unknown";
}

/**
 * Run a language-specific parse/syntax check on a file.
 * Returns { valid: bool|null, error: string|null }. `valid` is null when the
 * checker binary for that language is not installed (graceful degradation).
 */
export function checkSyntax(filePath, language) {
  const checker = LANG_CHECKERS[language];
  if (!checker) {
    return { valid: null, error: null };
  }
  try {
    execFileSync(checker.cmd, checker.args(filePath), { stdio: "pipe" });
    return { valid: true, error: null };
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return { valid: null, error: null };
    }
    const stderr = err && err.stderr ? err.stderr.toString() : (err && err.message) || "unknown error";
    return { valid: false, error: stderr };
  }
}

function lcsLength(a, b) {
  const n = b.length;
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

/**
 * Normalized line-level similarity between two file contents.
 * Returns matching lines (via LCS) divided by total lines, 0.0-1.0.
 */
export function behaviorScore(originalContent, resultContent) {
  const a = originalContent.split(/\r?\n/);
  const b = resultContent.split(/\r?\n/);
  const total = Math.max(a.length, b.length, 1);
  return lcsLength(a, b) / total;
}

/**
 * Check how many recorded mutations were restored (their "before" text is
 * present again) in the processed result. Returns { fixed, total }.
 */
export function checkMutationsFixed(mutations, resultContent) {
  if (!mutations || mutations.length === 0) {
    return { fixed: 0, total: 0 };
  }
  let fixed = 0;
  for (const mutation of mutations) {
    const before = mutation.before ?? "";
    if (before && resultContent.includes(before)) {
      fixed++;
    }
  }
  return { fixed, total: mutations.length };
}

function maxBraceDepth(content) {
  let depth = 0;
  let max = 0;
  for (const ch of content) {
    if (ch === "{") {
      depth++;
      if (depth > max) max = depth;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return max;
}

function maxIndentDepth(content) {
  let max = 0;
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const leading = line.match(/^[\t ]*/)[0];
    const spaces = leading.replace(/\t/g, "    ").length;
    const level = Math.floor(spaces / 4);
    if (level > max) max = level;
  }
  return max;
}

function maxNestingDepth(content, language) {
  return language === "py" ? maxIndentDepth(content) : maxBraceDepth(content);
}

/**
 * Compare original vs. result for regressions not tied to the diff itself:
 * a growing line count and a deeper max nesting (brace count for
 * brace-languages, indent level for Python). Returns an array of issue
 * strings, empty when nothing new is found.
 */
export function checkNewIssues(originalContent, resultContent, language) {
  const issues = [];
  const originalLines = originalContent.split(/\r?\n/).length;
  const resultLines = resultContent.split(/\r?\n/).length;
  if (resultLines > originalLines) {
    issues.push(`line count increased: ${originalLines} -> ${resultLines}`);
  }

  const originalDepth = maxNestingDepth(originalContent, language);
  const resultDepth = maxNestingDepth(resultContent, language);
  if (resultDepth > originalDepth) {
    issues.push(`max nesting depth increased: ${originalDepth} -> ${resultDepth}`);
  }

  return issues;
}

function runCli() {
  const { values } = parseArgs({
    options: {
      original: { type: "string" },
      result: { type: "string" },
      language: { type: "string" },
      mutations: { type: "string" },
    },
  });

  if (!values.original || !values.result) {
    process.stderr.write(
      "Usage: check-properties.mjs --original=<path> --result=<path> [--language=<lang>] [--mutations=<path>]\n",
    );
    process.exit(3);
  }

  const originalContent = readFileSync(values.original, "utf-8");
  const resultContent = readFileSync(values.result, "utf-8");
  const language = values.language || detectLanguage(values.result);

  const syntax = checkSyntax(values.result, language);

  let mutationsFixed = null;
  if (values.mutations) {
    const raw = JSON.parse(readFileSync(values.mutations, "utf-8"));
    const mutations = Array.isArray(raw) ? raw : (raw.mutations ?? []);
    mutationsFixed = checkMutationsFixed(mutations, resultContent);
  }

  const output = {
    syntax_valid: syntax.valid,
    behavior_score: behaviorScore(originalContent, resultContent),
    mutations_fixed: mutationsFixed,
    new_issues: checkNewIssues(originalContent, resultContent, language),
    language,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

const _filename = fileURLToPath(import.meta.url);
if (process.argv[1] === _filename) {
  runCli();
}
