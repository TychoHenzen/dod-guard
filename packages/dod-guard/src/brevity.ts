import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import {
  findBlockEnd,
  findJsFunctions,
  findPyFunctions,
  findPyBlockEnd,
  findRsFunctions,
  findCsFunctions,
  findFunctions,
  checkCyclomaticComplexity,
  checkUnnecessaryElse,
  checkAvoidableElse,
} from "./find-functions.js";
import type { FunctionRange } from "./find-functions.js";

/**
 * Brevity / code-elegance static analysis.
 *
 * Checks for:
 * 1. Max line length (default 120)
 * 2. Max function lines (default 30)
 * 3. Max file lines (default 300)
 * 4. Cyclomatic complexity — functions with CC > 5 flagged
 * 5. Guard clauses — unnecessary else after return/throw/break/continue
 * 6. Replacement ratio — deletions ≥ 20% of insertions for files with net >10 lines added
 *
 * Language support: JS/TS, Python, Rust, C# — regex-based heuristics (no full parser).
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface BrevityViolation {
  file: string;
  line: number;
  kind:
    | "line_too_long"
    | "function_too_long"
    | "file_too_long"
    | "high_complexity"
    | "unnecessary_else"
    | "else_avoidable"
    | "low_replacement_ratio";
  detail: string;
}

export interface BrevityOpts {
  maxLineLength: number;
  maxFunctionLines: number;
  maxFileLines: number;
  maxComplexity: number;
  requireGuardClauses: boolean;
  suggestGuardClauses: boolean;
  minReplacementRatio: number;
}

export const DEFAULT_BREVITY_OPTS: BrevityOpts = {
  maxLineLength: 120,
  maxFunctionLines: 30,
  maxFileLines: 300,
  maxComplexity: 5,
  requireGuardClauses: true,
  suggestGuardClauses: true,
  minReplacementRatio: 0.2,
};

interface DiffStat {
  insertions: number;
  deletions: number;
}

export interface BrevityReport {
  totalViolations: number;
  violations: BrevityViolation[];
  files: string[];
  perFile: Array<{
    file: string;
    violations: BrevityViolation[];
    lineCount: number;
    functionCount: number;
    longFunctions: number;
    highComplexityFunctions: number;
    unnecessaryElseCount: number;
    elseAvoidableCount: number;
    insertions?: number;
    deletions?: number;
  }>;
}

// ── Language detection ───────────────────────────────────────────────────

type Language = "js" | "py" | "rs" | "cs" | null;

function detectLanguage(file: string): Language {
  const ext = path.extname(file).toLowerCase();
  if ([".js", ".ts", ".mjs", ".cjs", ".mts", ".cts", ".jsx", ".tsx"].includes(ext)) return "js";
  if (ext === ".py") return "py";
  if (ext === ".rs") return "rs";
  if (ext === ".cs") return "cs";
  return null;
}

// ── Diff stat parsing ───────────────────────────────────────────────────

function parseDiffOutput(output: string, cwd: string): { files: string[]; stats: Map<string, DiffStat> } {
  const files: string[] = [];
  const stats = new Map<string, DiffStat>();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // numstat: insertions\ts\deletions\tfile
    const ns = line.match(/^(\d+)\t(\d+)\t(.+)$/);
    if (ns) {
      const name = ns[3].trim();
      files.push(name);
      stats.set(name, { insertions: Number(ns[1]), deletions: Number(ns[2]) });
      continue;
    }

    // stat: file | total +++++---
    const st = line.match(/^(.+?)\s+\|\s+(\d+)\s+([+-]*)$/);
    if (st) {
      const name = st[1].trim();
      files.push(name);
      const pm = st[3];
      let ins = 0,
        del = 0;
      for (const ch of pm) {
        if (ch === "+") ins++;
        else if (ch === "-") del++;
      }
      if (ins > 0 || del > 0) stats.set(name, { insertions: ins, deletions: del });
      continue;
    }

    // Plain file path: has extension + path separators
    if (/\.\w{1,6}$/.test(trimmed) && (trimmed.includes("/") || trimmed.includes("\\"))) {
      // Resolve relative paths against cwd
      const abs = path.resolve(cwd, trimmed);
      if (!files.includes(abs) && !files.includes(trimmed)) {
        files.push(trimmed);
      }
    }
  }

  return { files, stats };
}

// ── File discovery from command tokens ───────────────────────────────────

const SOURCE_EXTS = new Set([
  ".js",
  ".ts",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".jsx",
  ".tsx",
  ".py",
  ".rs",
  ".cs",
  ".go",
  ".java",
  ".rb",
  ".swift",
  ".kt",
]);

const SKIP_DIRS = new Set(["dist", "build", "out", ".next", "node_modules", "__pycache__", "target", ".git"]);

function isSourceFile(fp: string): boolean {
  return SOURCE_EXTS.has(path.extname(fp).toLowerCase());
}

function isInSkipDir(fp: string): boolean {
  return fp.split(path.sep).some((p) => SKIP_DIRS.has(p));
}

function extractSourceFilesFromCommand(command: string, cwd: string): string[] {
  const tokens = command.split(/\s+/);
  const files: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("-")) continue;
    if (/^(python|node|npm|npx|pnpm|yarn|jest|vitest|mocha|cargo|dotnet|go|git)$/.test(token)) continue;
    if (token.includes("/") || token.includes("\\") || token.includes(".")) {
      const resolved = path.resolve(cwd, token);
      if (isInSkipDir(resolved)) continue;
      if (existsSync(resolved) && isSourceFile(resolved)) files.push(resolved);
      else {
        // Glob: dir/*.ext
        const dir = path.dirname(resolved);
        const pat = path.basename(resolved);
        if (existsSync(dir) && pat.includes("*")) {
          try {
            for (const entry of readdirSync(dir)) {
              const full = path.join(dir, entry);
              const s = statSync(full);
              if (s.isFile() && !isInSkipDir(full) && isSourceFile(full)) files.push(full);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("brevity: unreadable dir", { dir, err: msg });
          }
        }
      }
    }
  }
  return [...new Set(files)];
}

// ── Core scanner ─────────────────────────────────────────────────────────

function scanFile(
  filePath: string,
  cwd: string,
  opts: BrevityOpts,
): {
  violations: BrevityViolation[];
  lineCount: number;
  functionCount: number;
  longFunctions: number;
  highComplexityFunctions: number;
  unnecessaryElseCount: number;
  elseAvoidableCount: number;
} {
  const lang = detectLanguage(filePath);
  if (!lang) {
    return {
      violations: [],
      lineCount: 0,
      functionCount: 0,
      longFunctions: 0,
      highComplexityFunctions: 0,
      unnecessaryElseCount: 0,
      elseAvoidableCount: 0,
    };
  }

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  const relPath = path.relative(cwd, filePath);
  const violations: BrevityViolation[] = [];

  // 1. Per-line checks — max line length
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i].length;
    if (len > opts.maxLineLength) {
      violations.push({
        file: relPath,
        line: i + 1,
        kind: "line_too_long",
        detail: `line length ${len} exceeds max ${opts.maxLineLength}`,
      });
    }
  }

  const lineCount = lines.length;

  // 2. Max file lines
  if (lineCount > opts.maxFileLines) {
    // Report as single violation, anchored at line 1
    violations.push({
      file: relPath,
      line: 1,
      kind: "file_too_long",
      detail: `file has ${lineCount} lines, exceeds max ${opts.maxFileLines}`,
    });
  }

  // 3. Function-level checks
  const functions = findFunctions(lines, lang);
  let longFunctions = 0;
  let highComplexityFunctions = 0;
  let unnecessaryElseCount = 0;
  let elseAvoidableCount = 0;

  for (const fn of functions) {
    const fnLen = fn.endLine - fn.startLine + 1;

    if (fnLen > opts.maxFunctionLines) {
      longFunctions++;
      violations.push({
        file: relPath,
        line: fn.startLine,
        kind: "function_too_long",
        detail: `"${fn.name}" is ${fnLen} lines, exceeds max ${opts.maxFunctionLines}`,
      });
    }

    // Cyclomatic complexity
    const { complexity } = checkCyclomaticComplexity(fn.bodyLines, lang);
    if (complexity > opts.maxComplexity) {
      highComplexityFunctions++;
      violations.push({
        file: relPath,
        line: fn.startLine,
        kind: "high_complexity",
        detail: `"${fn.name}" CC=${complexity}, exceeds max ${opts.maxComplexity} — extract decision-heavy blocks into helpers`,
      });
    }

    // Unnecessary else (if-branch already exits — else is dead weight)
    if (opts.requireGuardClauses) {
      const { count } = checkUnnecessaryElse(fn.bodyLines, lang);
      if (count > 0) {
        unnecessaryElseCount += count;
        violations.push({
          file: relPath,
          line: fn.startLine,
          kind: "unnecessary_else",
          detail: `"${fn.name}" has ${count} unnecessary else clause${count > 1 ? "s" : ""} after exit statement — use guard clause instead`,
        });
      }
    }

    // Avoidable else (function never uses guard clauses — suggest adopting the pattern)
    if (opts.suggestGuardClauses) {
      const { count } = checkAvoidableElse(fn.bodyLines, lang);
      if (count > 0) {
        elseAvoidableCount += count;
        violations.push({
          file: relPath,
          line: fn.startLine,
          kind: "else_avoidable",
          detail: `"${fn.name}" has ${count} if/else pair${count > 1 ? "s" : ""} and zero guard clauses — refactor if-branch to exit early, eliminate else`,
        });
      }
    }
  }

  return {
    violations,
    lineCount,
    functionCount: functions.length,
    longFunctions,
    highComplexityFunctions,
    unnecessaryElseCount,
    elseAvoidableCount,
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Run brevity analysis on source files referenced by a command.
 * Returns null when no source files can be identified.
 */
export function analyseBrevity(
  command: string,
  cwd: string,
  opts: BrevityOpts = DEFAULT_BREVITY_OPTS,
): BrevityReport | null {
  const files = extractSourceFilesFromCommand(command, cwd);

  if (files.length === 0) return null;

  return buildReport(files, cwd, opts, undefined);
}

/**
 * Re-analyze using command output — handles git diff --name-only and similar.
 */
export function analyseBrevityFromOutput(
  commandOutput: string,
  cwd: string,
  opts: BrevityOpts = DEFAULT_BREVITY_OPTS,
): BrevityReport | null {
  const { files: diffFiles, stats } = parseDiffOutput(commandOutput, cwd);

  // Resolve files — diff output gives relative paths, resolve against cwd
  const resolved = diffFiles
    .map((f) => path.resolve(cwd, f))
    .filter((f) => existsSync(f) && isSourceFile(f) && !isInSkipDir(f));

  if (resolved.length === 0) {
    // Fallback: try extracting source-like paths from output
    const extracted: string[] = [];
    for (const line of commandOutput.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(" ") || trimmed.startsWith("\t")) continue;
      if (/\.\w{1,6}$/.test(trimmed)) {
        const abs = path.resolve(cwd, trimmed);
        if (existsSync(abs) && isSourceFile(abs) && !isInSkipDir(abs)) {
          extracted.push(abs);
        }
      }
    }
    if (extracted.length === 0) return null;
    return buildReport([...new Set(extracted)], cwd, opts, undefined);
  }

  return buildReport(resolved, cwd, opts, stats.size > 0 ? stats : undefined);
}

function normalizeRelPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function buildReport(
  files: string[],
  cwd: string,
  opts: BrevityOpts,
  diffStats?: Map<string, DiffStat>,
): BrevityReport {
  // Normalize diffStats keys to forward slashes for cross-platform lookup
  const normalizedStats = diffStats ? new Map([...diffStats].map(([k, v]) => [normalizeRelPath(k), v])) : undefined;

  const allViolations: BrevityViolation[] = [];
  const perFile: BrevityReport["perFile"] = [];

  for (const file of files) {
    const result = scanFile(file, cwd, opts);
    const ext: BrevityViolation[] = [...result.violations];

    // Replacement ratio check
    if (normalizedStats) {
      const relPath = normalizeRelPath(path.relative(cwd, file));
      const stat = normalizedStats.get(relPath);
      if (stat && stat.insertions > 10) {
        const ratio = stat.deletions / stat.insertions;
        if (ratio < opts.minReplacementRatio) {
          ext.push({
            file: relPath,
            line: 1,
            kind: "low_replacement_ratio",
            detail: `+${stat.insertions} -${stat.deletions} (deletion ratio ${(ratio * 100).toFixed(0)}% < required ${(opts.minReplacementRatio * 100).toFixed(0)}%) — old code not removed`,
          });
        }
      }
    }

    allViolations.push(...ext);
    const relPath = normalizeRelPath(path.relative(cwd, file));
    perFile.push({
      file: relPath,
      violations: ext,
      lineCount: result.lineCount,
      functionCount: result.functionCount,
      longFunctions: result.longFunctions,
      highComplexityFunctions: result.highComplexityFunctions,
      unnecessaryElseCount: result.unnecessaryElseCount,
      elseAvoidableCount: result.elseAvoidableCount,
      insertions: normalizedStats?.get(relPath)?.insertions,
      deletions: normalizedStats?.get(relPath)?.deletions,
    });
  }

  return {
    totalViolations: allViolations.length,
    violations: allViolations,
    files: files.map((f) => normalizeRelPath(path.relative(cwd, f))),
    perFile,
  };
}
