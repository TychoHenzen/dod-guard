import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";

/**
 * Brevity / code-elegance static analysis.
 *
 * Checks for:
 * 1. Max line length (default 120)
 * 2. Max function lines (default 30)
 * 3. Max file lines (default 300)
 * 4. Function cohesion — mixed selection + iteration = flagged
 * 5. Replacement ratio — deletions ≥ 20% of insertions for files with net >10 lines added
 *
 * Language support: JS/TS, Python, Rust, C# — regex-based heuristics (no full parser).
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface BrevityViolation {
  file: string;
  line: number;
  kind: "line_too_long" | "function_too_long" | "file_too_long" | "mixed_cohesion" | "low_replacement_ratio";
  detail: string;
}

export interface BrevityOpts {
  maxLineLength: number;
  maxFunctionLines: number;
  maxFileLines: number;
  requireCohesion: boolean;
  minReplacementRatio: number;
}

export const DEFAULT_BREVITY_OPTS: BrevityOpts = {
  maxLineLength: 120,
  maxFunctionLines: 30,
  maxFileLines: 300,
  requireCohesion: true,
  minReplacementRatio: 0.2,
};

export interface FunctionRange {
  startLine: number;
  endLine: number;
  name: string;
  bodyLines: string[];
}

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
    mixedCohesionFunctions: number;
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

// ── Function detection ──────────────────────────────────────────────────

const CONTROL_KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "catch", "try", "finally",
  "return", "throw", "new", "typeof", "instanceof", "class", "import", "export",
  "default", "from", "as", "yield", "await", "break", "continue", "with",
  "debugger", "void", "delete", "in", "of",
]);

function findBlockEnd(lines: string[], startIdx: number, open: string, close: string): number {
  const baseIndent = getIndent(lines[startIdx]);
  const openLine = lines[startIdx];
  let braceIdx = openLine.indexOf(open);
  if (braceIdx === -1) braceIdx = 0;

  let depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    let inString: string | null = null;
    const startCol = i === startIdx ? braceIdx : 0;

    for (let j = startCol; j < line.length; j++) {
      const ch = line[j];
      const prev = j > 0 ? line[j - 1] : "";

      if (inString) {
        if (ch === inString && prev !== "\\") inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }
      if (ch === "/" && j + 1 < line.length && line[j + 1] === "/") break; // line comment
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0 && getIndent(line) <= baseIndent) return i;
      }
    }
  }
  return lines.length - 1;
}

function getIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

// ── JS/TS function detection ─────────────────────────────────────────────

function findJsFunctions(lines: string[]): FunctionRange[] {
  const out: FunctionRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || /^\s*\/\//.test(line) || /^\s*\/\*/.test(line)) continue;

    // function foo() {  or  async function foo() {
    let m = line.match(/^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)/);
    if (m) {
      const end = findBlockEnd(lines, i, "{", "}");
      if (end > i) {
        out.push({ startLine: i + 1, endLine: end + 1, name: m[1], bodyLines: lines.slice(i + 1, end) });
        i = end; continue;
      }
    }

    // Class method: methodName(args) {  (skip control-flow keywords)
    m = line.match(/^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^)]*\)\s*\{/);
    if (m && !CONTROL_KEYWORDS.has(m[1])) {
      const end = findBlockEnd(lines, i, "{", "}");
      if (end > i) {
        out.push({ startLine: i + 1, endLine: end + 1, name: m[1], bodyLines: lines.slice(i + 1, end) });
        i = end; continue;
      }
    }

    // Arrow function assigned: const name = (...) => {  or let name = (...) => {
    m = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/);
    if (m) {
      const end = findBlockEnd(lines, i, "{", "}");
      if (end > i) {
        out.push({ startLine: i + 1, endLine: end + 1, name: m[1], bodyLines: lines.slice(i + 1, end) });
        i = end; continue;
      }
    }

    // Function expression: const name = function (...) {
    m = line.match(/^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(/);
    if (m) {
      const end = findBlockEnd(lines, i, "{", "}");
      if (end > i) {
        out.push({ startLine: i + 1, endLine: end + 1, name: m[1], bodyLines: lines.slice(i + 1, end) });
        i = end; continue;
      }
    }
  }
  return out;
}

// ── Python function detection ────────────────────────────────────────────

function findPyFunctions(lines: string[]): FunctionRange[] {
  const out: FunctionRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*def\s+(\w+)\s*\(/);
    if (!m) continue;
    const end = findPyBlockEnd(lines, i);
    if (end > i) {
      out.push({ startLine: i + 1, endLine: end + 1, name: m[1], bodyLines: lines.slice(i + 1, end + 1) });
      i = end;
    }
  }
  return out;
}

function findPyBlockEnd(lines: string[], startIdx: number): number {
  const baseIndent = getIndent(lines[startIdx]);
  let i = startIdx + 1;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "") { i++; continue; }
    if (getIndent(lines[i]) <= baseIndent) return i - 1;
    i++;
  }
  return lines.length - 1;
}

// ── Rust function detection ──────────────────────────────────────────────

function findRsFunctions(lines: string[]): FunctionRange[] {
  const out: FunctionRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:pub(?:\s*\(\s*(?:crate|super|self)\s*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)/);
    if (!m) continue;
    const end = findBlockEnd(lines, i, "{", "}");
    if (end > i) {
      out.push({ startLine: i + 1, endLine: end + 1, name: m[1], bodyLines: lines.slice(i + 1, end) });
      i = end;
    }
  }
  return out;
}

// ── C# function detection ────────────────────────────────────────────────

function findCsFunctions(lines: string[]): FunctionRange[] {
  const out: FunctionRange[] = [];
  const modifierPat = /(?:public|private|protected|internal|static|virtual|override|async|sealed|abstract|unsafe|partial|readonly|extern)\s+/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("//") || line.startsWith("[") || line.startsWith("/*")) continue;
    // Match: [modifiers...] ReturnType MethodName(args) [where constraint] {
    const m = line.match(
      /^(?:(?:public|private|protected|internal|static|virtual|override|async|sealed|abstract|unsafe|partial|readonly|extern)\s+)*(\w+(?:<[^>]*>)?)\s+(\w+)\s*\([^)]*\)\s*(?:where\s+[^{]+)?\{/,
    );
    if (!m) continue;
    const nameToken = m[2];
    // Filter out constructors (name === class name, hard to detect without context — skip keywords)
    if (CONTROL_KEYWORDS.has(nameToken)) continue;
    const end = findBlockEnd(lines, i, "{", "}");
    if (end > i) {
      out.push({ startLine: i + 1, endLine: end + 1, name: nameToken, bodyLines: lines.slice(i + 1, end) });
      i = end;
    }
  }
  return out;
}

function findFunctions(lines: string[], lang: Language): FunctionRange[] {
  switch (lang) {
    case "js": return findJsFunctions(lines);
    case "py": return findPyFunctions(lines);
    case "rs": return findRsFunctions(lines);
    case "cs": return findCsFunctions(lines);
    default: return [];
  }
}

// ── Cohesion (selection vs iteration within a function body) ─────────────

const SELECTION_RE: Record<string, RegExp> = {
  js: /\b(if\s*\(|else\s*if|else\s*\{|switch\s*\(|case\s+[^:]+:|ternary\?)/,
  py: /\b(if\s+|elif\s+|else\s*:|match\s+\w)/,
  rs: /\b(if\s+|else\s+if|else\s*\{|match\s+\w)/,
  cs: /\b(if\s*\(|else\s+if|else\s*\{|switch\s*\(|case\s+[^:]+:)/,
};

const ITERATION_RE: Record<string, RegExp> = {
  js: /\b(for\s*\(|while\s*\(|do\s*\{|\.forEach\s*\(|for\s+\([^)]*\s+of\s+|for\s+\([^)]*\s+in\s+)/,
  py: /\b(for\s+\w+\s+in\s+|while\s+\w)/,
  rs: /\b(for\s+\w+\s+in\s+|while\s+\w|loop\s*\{)/,
  cs: /\b(for\s*\(|foreach\s*\(|while\s*\(|do\s*\{)/,
};

function hasPattern(lines: string[], re: RegExp): boolean {
  for (const line of lines) {
    const stripped = stripCommentsAndStrings(line);
    if (re.test(stripped)) return true;
  }
  return false;
}

/** Crude comment/string removal to avoid false positives in text literals. */
function stripCommentsAndStrings(line: string): string {
  // Remove single-line comments
  let s = line.replace(/\/\/.*$/, "").replace(/#.*$/, "");
  // Remove string literals (bare-bones)
  s = s.replace(/`[^`]*`/g, "").replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  return s;
}

function checkCohesion(
  bodyLines: string[],
  lang: Language,
): { hasSelection: boolean; hasIteration: boolean; mixed: boolean } {
  if (!lang) return { hasSelection: false, hasIteration: false, mixed: false };
  const selRe = SELECTION_RE[lang];
  const iterRe = ITERATION_RE[lang];
  if (!selRe || !iterRe) return { hasSelection: false, hasIteration: false, mixed: false };
  const hasSelection = hasPattern(bodyLines, selRe);
  const hasIteration = hasPattern(bodyLines, iterRe);
  return { hasSelection, hasIteration, mixed: hasSelection && hasIteration };
}

// ── Diff stat parsing ───────────────────────────────────────────────────

function parseDiffOutput(
  output: string,
  cwd: string,
): { files: string[]; stats: Map<string, DiffStat> } {
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
    const st = line.match(/^(.+?)\s+\|\s+(\d+)\s+([+\-]*)$/);
    if (st) {
      const name = st[1].trim();
      files.push(name);
      const pm = st[3];
      let ins = 0, del = 0;
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
  ".js", ".ts", ".mjs", ".cjs", ".mts", ".cts", ".jsx", ".tsx",
  ".py", ".rs", ".cs", ".go", ".java", ".rb", ".swift", ".kt",
]);

const SKIP_DIRS = new Set([
  "dist", "build", "out", ".next", "node_modules", "__pycache__", "target", ".git",
]);

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
          } catch { /* unreadable */ }
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
  mixedCohesionFunctions: number;
} {
  const lang = detectLanguage(filePath);
  if (!lang) {
    return { violations: [], lineCount: 0, functionCount: 0, longFunctions: 0, mixedCohesionFunctions: 0 };
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
  let mixedCohesionFunctions = 0;

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

    if (opts.requireCohesion) {
      const { mixed } = checkCohesion(fn.bodyLines, lang);
      if (mixed) {
        mixedCohesionFunctions++;
        violations.push({
          file: relPath,
          line: fn.startLine,
          kind: "mixed_cohesion",
          detail: `"${fn.name}" mixes selection (if/switch) and iteration (for/while) — split into separate functions`,
        });
      }
    }
  }

  return {
    violations,
    lineCount,
    functionCount: functions.length,
    longFunctions,
    mixedCohesionFunctions,
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
  let files = extractSourceFilesFromCommand(command, cwd);

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
  const resolved = diffFiles.map((f) => path.resolve(cwd, f)).filter(
    (f) => existsSync(f) && isSourceFile(f) && !isInSkipDir(f),
  );

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
  const normalizedStats = diffStats
    ? new Map([...diffStats].map(([k, v]) => [normalizeRelPath(k), v]))
    : undefined;

  const allViolations: BrevityViolation[] = [];
  const perFile: BrevityReport["perFile"] = [];

  for (const file of files) {
    const result = scanFile(file, cwd, opts);
    let ext: BrevityViolation[] = [...result.violations];

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
      mixedCohesionFunctions: result.mixedCohesionFunctions,
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
