import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";

/**
 * Observability analysis for source files. Detects logging patterns, error
 * handlers, and anti-patterns (empty catch, swallowed errors, bare strings).
 *
 * Designed as a DoD proof engine: run a command that identifies changed files,
 * scan each one for instrumentation quality, and return a structured report
 * used by executeProof() to pass/fail the step.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface AntiPatternHit {
  file: string;
  line: number;
  kind: "empty_catch" | "swallowed_error" | "bare_log";
  snippet: string;
}

export interface ErrorHandler {
  file: string;
  line: number;
  logged: boolean;
  snippet: string;
}

export interface ObservabilityReport {
  totalLogStatements: number;
  totalErrorHandlers: number;
  errorHandlersLogged: number;
  antiPatterns: AntiPatternHit[];
  files: string[];
  perFile: Array<{
    file: string;
    logCount: number;
    errorHandlers: number;
    errorHandlersLogged: number;
    antiPatterns: AntiPatternHit[];
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

// ── Log statement patterns (per language) ─────────────────────────────────

const LOG_PATTERNS: Record<Language & string, RegExp[]> = {
  js: [
    /\bconsole\.(log|error|warn|info|debug|trace)\s*\(/,
    /\b(logger|log)\.(error|warn|info|debug|trace|fatal)\s*\(/,
    /\bpino\./,
    /\bwinston\./,
    /\bbunyan\./,
  ],
  py: [
    /\blogging\.(debug|info|warning|error|critical|exception|log)\s*\(/,
    /\b(logger|log|self\.logger|self\._logger)\.(debug|info|warning|warn|error|critical|exception|log)\s*\(/,
    /\bloguru\./,
  ],
  rs: [
    /(?:\blog|error|warn|info|debug|trace)!\s*\(/,
    /\beprintln!\s*\(/,
    /\bdbg!\s*\(/,
    /\btracing::(?:info|error|warn|debug|trace)\s*\(/,
  ],
  cs: [
    /\b(?:Log|_logger|logger|Logger)\.(?:Log(?:Information|Warning|Error|Debug|Critical|Trace)?|Information|Warning|Error|Debug|Fatal)\s*\(/,
    /\bConsole\.Write(?:Line)?\s*\(/,
    /\bDebug\.Write(?:Line)?\s*\(/,
  ],
};

function isLogStatement(line: string, lang: Language): boolean {
  if (!lang) return false;
  const patterns = LOG_PATTERNS[lang];
  return patterns ? patterns.some((p) => p.test(line)) : false;
}

// ── Error handler patterns (per language) ─────────────────────────────────

function findErrorHandlers(lines: string[], lang: Language): ErrorHandlerResult[] {
  switch (lang) {
    case "js": return findJsErrorHandlers(lines);
    case "py": return findPyErrorHandlers(lines);
    case "rs": return findRsErrorHandlers(lines);
    case "cs": return findCsErrorHandlers(lines);
    default: return [];
  }
}

interface ErrorHandlerResult {
  line: number;
  /** 1-based line where the handler block ends. */
  endLine: number;
  logged: boolean;
  snippet: string;
}

function findJsErrorHandlers(lines: string[]): ErrorHandlerResult[] {
  const results: ErrorHandlerResult[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match `catch` — optionally with binding: catch, catch(e), catch (e)
    if (/\bcatch\b\s*(\([^)]*\))?\s*\{/.test(line)) {
      const endLine = findBlockEnd(lines, i, "{", "}");
      const blockLines = lines.slice(i, endLine + 1);
      const hasLog = blockLines.some((l) => isLogStatement(l, "js"));
      results.push({ line: i + 1, endLine: endLine + 1, logged: hasLog, snippet: line.trim() });
    }
  }
  return results;
}

function findPyErrorHandlers(lines: string[]): ErrorHandlerResult[] {
  const results: ErrorHandlerResult[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*except\b/.test(line)) {
      const endLine = findPyBlockEnd(lines, i);
      const blockLines = lines.slice(i, endLine + 1);
      const hasLog = blockLines.some((l) => isLogStatement(l, "py"));
      results.push({ line: i + 1, endLine: endLine + 1, logged: hasLog, snippet: line.trim() });
    }
  }
  return results;
}

function findRsErrorHandlers(lines: string[]): ErrorHandlerResult[] {
  const results: ErrorHandlerResult[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Err(_) => or Err(e) =>
    if (/\bErr\s*\([^)]*\)\s*=>/.test(line) || /\bmatch\b.*\{/.test(line)) {
      const endLine = findBlockEnd(lines, i, "{", "}");
      const blockLines = lines.slice(i, endLine + 1);
      const hasLog = blockLines.some((l) => isLogStatement(l, "rs"));
      results.push({ line: i + 1, endLine: endLine + 1, logged: hasLog, snippet: line.trim() });
    }
  }
  return results;
}

function findCsErrorHandlers(lines: string[]): ErrorHandlerResult[] {
  const results: ErrorHandlerResult[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\bcatch\b\s*(\([^)]*\))?\s*\{/.test(line)) {
      const endLine = findBlockEnd(lines, i, "{", "}");
      const blockLines = lines.slice(i, endLine + 1);
      const hasLog = blockLines.some((l) => isLogStatement(l, "cs"));
      results.push({ line: i + 1, endLine: endLine + 1, logged: hasLog, snippet: line.trim() });
    }
  }
  return results;
}

/** Find the matching closing brace for a brace-delimited block.
 *  Uses indentation heuristics: starts tracking from the first `{` on the line.
 *  Skips braces inside quoted strings so object literals in log arguments
 *  don't break block detection. Returns the line index of the first `}` that
 *  is at or left of the block's base indentation level. */
function findBlockEnd(lines: string[], startIdx: number, open: string, close: string): number {
  // Find the indentation level of the line that opens the block.
  const baseIndent = getIndent(lines[startIdx]);

  // Find the position of the opening brace on this line
  const openLine = lines[startIdx];
  let braceIdx = -1;
  for (let j = 0; j < openLine.length; j++) {
    if (openLine[j] === open) { braceIdx = j; break; }
  }
  if (braceIdx === -1) return lines.length - 1;

  // Track depth from the opening brace position
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

      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }

      // Skip single-line comments — rest of the line is comment
      if (ch === "/" && j + 1 < line.length && line[j + 1] === "/") {
        break;
      }

      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        // Only return when we're at a brace at or left of base indent
        // AND depth is 0 — this prevents object-literal } from matching.
        if (depth === 0 && getIndent(line) <= baseIndent) {
          return i;
        }
      }
    }
  }
  return lines.length - 1;
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/** Check if a line contains a catch block with an immediately-closing empty body.
 *  e.g. `catch (e) { }`, `catch { }`, `} catch (e) { }` */
function isInlineEmptyCatch(line: string): boolean {
  // Match "catch" optionally preceded by "}", optionally with binding, then { with
  // optional whitespace and a closing } on the same line. The body must be empty
  // (zero non-whitespace chars between { and }).
  return /\bcatch\b\s*(\([^)]*\))?\s*\{\s*\}\s*$/.test(line);
}

/** Find end of a Python indented block (next line at same or lower indent). */
function findPyBlockEnd(lines: string[], startIdx: number): number {
  const match = lines[startIdx].match(/^(\s*)/);
  const baseIndent = match ? match[1].length : 0;
  let i = startIdx + 1;
  // Advance past the except line itself if it has a continuation
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "") { i++; continue; }
    const lineIndent = lines[i].match(/^(\s*)/)?.[1].length ?? 0;
    if (lineIndent <= baseIndent) return i - 1;
    i++;
  }
  return lines.length - 1;
}

// ── Anti-pattern detection ───────────────────────────────────────────────

function detectAntiPatterns(
  lines: string[],
  lang: Language,
  filePath: string,
): AntiPatternHit[] {
  switch (lang) {
    case "js": return detectJsAntiPatterns(lines, filePath);
    case "py": return detectPyAntiPatterns(lines, filePath);
    case "rs": return detectRsAntiPatterns(lines, filePath);
    default: return [];
  }
}

/** Empty catch block: `catch { }` or `catch(e) { }` with nothing inside. */
function detectJsAntiPatterns(lines: string[], file: string): AntiPatternHit[] {
  const hits: AntiPatternHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comment-only lines
    if (/^\s*\/\/|^\s*\/\*|^\s*\*/.test(trimmed)) continue;

    // Inline empty catch: `catch (e) { }` or `} catch (e) { }` on one line
    // Also skip if the match is inside a string (e.g. regex pattern for catch)
    if (isInlineEmptyCatch(line)) {
      hits.push({ file, line: i + 1, kind: "empty_catch", snippet: line.trim() });
      continue;
    }
    // Multi-line catch block: check if body is truly empty
    if (/\bcatch\b\s*(\([^)]*\))?\s*\{/.test(line)) {
      const endLine = findBlockEnd(lines, i, "{", "}");
      const body = lines.slice(i + 1, endLine).map((l) => l.trim()).filter((l) => l.length > 0);
      if (body.length === 0) {
        hits.push({ file, line: i + 1, kind: "empty_catch", snippet: line.trim() });
      }
    }
    // Bare log message: static string only, no variable interpolation
    if (isLogStatement(line, "js") && isBareStaticLog(line, "js")) {
      hits.push({ file, line: i + 1, kind: "bare_log", snippet: line.trim() });
    }
  }
  return hits;
}

function detectPyAntiPatterns(lines: string[], file: string): AntiPatternHit[] {
  const hits: AntiPatternHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // except: pass / except Exception: pass
    if (/^\s*except\b.*:\s*pass\s*(#.*)?$/.test(line)) {
      hits.push({ file, line: i + 1, kind: "empty_catch", snippet: line.trim() });
      continue;
    }
    // Multi-line except with only pass next
    if (/^\s*except\b/.test(line)) {
      const endLine = findPyBlockEnd(lines, i);
      const body = lines.slice(i + 1, endLine + 1).map((l) => l.trim()).filter((l) => l.length > 0);
      const allPass = body.length > 0 && body.every((l) => l === "pass" || /^\s*pass\s*(#.*)?$/.test(l));
      if (allPass) {
        hits.push({ file, line: i + 1, kind: "empty_catch", snippet: line.trim() });
      }
    }
    // Bare log message
    if (isLogStatement(line, "py") && isBareStaticLog(line, "py")) {
      hits.push({ file, line: i + 1, kind: "bare_log", snippet: line.trim() });
    }
  }
  return hits;
}

function detectRsAntiPatterns(lines: string[], file: string): AntiPatternHit[] {
  const hits: AntiPatternHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Err(_) => { } empty block
    if (/\bErr\s*\([^)]*\)\s*=>\s*\{\s*\}\s*,?$/.test(line)) {
      hits.push({ file, line: i + 1, kind: "empty_catch", snippet: line.trim() });
      continue;
    }
    // Bare log: error!("static") or info!("text") with no format args
    if (isLogStatement(line, "rs") && isBareStaticLog(line, "rs")) {
      hits.push({ file, line: i + 1, kind: "bare_log", snippet: line.trim() });
    }
  }
  return hits;
}

// ── Bare static log detection ────────────────────────────────────────────

/**
 * A log statement is "bare" when the message argument is a pure string literal
 * with no variable interpolation — no identifiers, template expressions, or
 * format specifiers. Bare messages convey zero runtime context.
 */
function isBareStaticLog(line: string, lang: Language): boolean {
  switch (lang) {
    case "js": return isBareStaticJs(line);
    case "py": return isBareStaticPy(line);
    case "rs": return isBareStaticRs(line);
    default: return false;
  }
}

function isBareStaticJs(line: string): boolean {
  // Extract the first argument to console.*/logger.*
  // console.error("msg") → bare
  // console.error("msg", e) → NOT bare (has second arg with variable)
  // console.error(`msg ${x}`) → NOT bare (template literal)
  // logger.error("msg", { err }) → NOT bare
  const match = line.match(/\b(?:console|logger|log|pino|winston)\.\w+\s*\(([^)]+)\)/);
  if (!match) return false;
  const args = match[1];
  // If there's only one arg and it's a literal string (not template), it's bare
  const argsList = splitArgs(args);
  if (argsList.length === 0) return false;
  // Template literal → not bare
  if (argsList.some((a) => a.includes("`") && a.includes("${"))) return false;
  if (argsList.length >= 2) return false; // multiple args → not bare
  const first = argsList[0].trim();
  // Pure string literal (single or double quoted) → bare
  if (/^"[^"]*"$/.test(first) || /^'[^']*'$/.test(first) || /^`[^`]*`$/.test(first)) return true;
  return false;
}

function isBareStaticPy(line: string): boolean {
  const match = line.match(/\b(?:logging|logger|log|self\.logger|self\._logger)\.\w+\s*\(([^)]+)\)/);
  if (!match) return false;
  const args = match[1];
  const argsList = splitArgs(args);
  if (argsList.length === 0) return false;
  // f-string → not bare
  if (argsList.some((a) => a.startsWith("f\"") || a.startsWith("f'"))) return false;
  // Has % operator → not bare
  if (argsList.length >= 2) return false;
  if (/%[sdfr]/.test(args)) return false;
  const first = argsList[0].trim();
  if (/^"[^"]*"$/.test(first) || /^'[^']*'$/.test(first)) return true;
  return false;
}

function isBareStaticRs(line: string): boolean {
  // Rust macros: error!("msg") or error!("msg {}", var)
  const match = line.match(/\b(?:log|error|warn|info|debug|trace|eprintln|dbg)!\s*\(\s*("[^"]*")/);
  if (!match) return false;
  const msg = match[1];
  // Contains format placeholder → not bare
  if (/\{\}/.test(msg) || /\{[^}]*\}/.test(msg)) return false;
  // The macro call has additional args after the string → not bare
  const afterStr = line.slice(line.indexOf(msg) + msg.length);
  if (afterStr.includes(",") && afterStr.indexOf(",") < afterStr.indexOf(")")) return false;
  return true;
}

/** Simple argument splitter that handles nested parens. */
function splitArgs(s: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) args.push(trimmed);
  return args;
}

// ── Swallowed error detection ────────────────────────────────────────────

function detectSwallowedErrors(
  lines: string[],
  lang: Language,
  filePath: string,
): AntiPatternHit[] {
  // Already handled by "unlogged error handler" check. Here we catch the
  // specific pattern: catch(e) { return X } with no log statement.
  // This is distinct from empty_catch — the handler does something (returns)
  // but swallows the error silently.
  const hits: AntiPatternHit[] = [];
  if (lang !== "js" && lang !== "cs") return hits;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bcatch\b\s*(\([^)]*\))?\s*\{/.test(line)) continue;
    const endLine = findBlockEnd(lines, i, "{", "}");
    const blockLines = lines.slice(i + 1, endLine);
    const codeLines = blockLines.map((l) => l.trim()).filter((l) => l.length > 0);
    const hasLog = blockLines.some((l) => isLogStatement(l, lang));
    const hasReturn = codeLines.some((l) => /\breturn\b/.test(l));
    const hasThrow = codeLines.some((l) => /\bthrow\b/.test(l));

    // Swallowed: error caught, return/continue/empty but no log or rethrow
    if (!hasLog && !hasThrow && codeLines.length > 0) {
      hits.push({
        file: filePath,
        line: i + 1,
        kind: "swallowed_error",
        snippet: line.trim(),
      });
    }
  }
  return hits;
}

// ── File discovery from command ──────────────────────────────────────────

const SOURCE_EXTS = new Set([
  ".js", ".ts", ".mjs", ".cjs", ".mts", ".cts", ".jsx", ".tsx",
  ".py", ".rs", ".cs", ".go", ".java", ".rb", ".swift", ".kt",
]);

/** Directories to skip during file discovery (build output). */
const SKIP_DIRS = new Set(["dist", "build", "out", ".next", "node_modules", "__pycache__", "target", ".git"]);

function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTS.has(ext);
}

function isInSkipDir(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  return parts.some((p) => SKIP_DIRS.has(p));
}

/**
 * Extract source file paths from a command's output. First tries to parse
 * each line as a file path; falls back to scanning the command tokens for
 * path-like arguments (e.g. `python -m pytest tests/test_foo.py`).
 */
function extractSourceFilesFromOutput(output: string, cwd: string): string[] {
  const files: string[] = [];

  // Strategy 1: each line that looks like a path
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip lines that are clearly not paths (too short, start with common non-path markers)
    if (/^[a-z_]+:/i.test(trimmed) && !trimmed.includes("/") && !trimmed.includes("\\")) continue;
    // If line looks like a path (has extension or path separators)
    if (trimmed.includes(".") || trimmed.includes("/") || trimmed.includes("\\")) {
      // Extract what looks like a file path from the line
      const pathMatch = trimmed.match(/([^\s:]+\.[a-z]{1,6})\b/gi);
      if (pathMatch) {
        for (const candidate of pathMatch) {
          const resolved = path.resolve(cwd, candidate.trim());
          if (isInSkipDir(resolved)) continue;
          if (existsSync(resolved) && isSourceFile(resolved)) {
            files.push(resolved);
          }
        }
      }
    }
  }

  return [...new Set(files)];
}

/**
 * Extract source file paths from the command tokens themselves (e.g. test
 * commands that reference specific files).
 */
function extractSourceFilesFromCommand(command: string, cwd: string): string[] {
  const tokens = command.split(/\s+/);
  const files: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("-")) continue;
    if (/^(python|node|npm|npx|pnpm|yarn|jest|vitest|mocha|cargo|dotnet|go)$/.test(token)) continue;
    if (token.includes("/") || token.includes("\\") || token.includes(".")) {
      const resolved = path.resolve(cwd, token);
      if (isInSkipDir(resolved)) continue;
      if (existsSync(resolved) && isSourceFile(resolved)) {
        files.push(resolved);
      }
      // Glob pattern support
      else {
        const dir = path.dirname(resolved);
        const pat = path.basename(resolved);
        if (existsSync(dir) && pat.includes("*")) {
          try {
            const { readdirSync } = require("node:fs");
            const entries = readdirSync(dir);
            const regex = new RegExp("^" + pat.replace(/\*/g, ".*").replace(/\./g, "\\.") + "$");
            for (const entry of entries) {
              const full = path.join(dir, entry);
              if (isInSkipDir(full)) continue;
              if (!existsSync(full)) continue;
              const stat = require("node:fs").statSync(full);
              if (stat.isFile() && isSourceFile(full)) {
                files.push(full);
              }
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (process.env.DOD_STORE_DIR) console.error("observability: unreadable dir", { dir, err: msg });
          }
        }
      }
    }
  }

  return [...new Set(files)];
}

// ── Core scanner ─────────────────────────────────────────────────────────

function scanFile(filePath: string, cwd: string): {
  logCount: number;
  errorHandlers: ErrorHandler[];
  antiPatterns: AntiPatternHit[];
} {
  const lang = detectLanguage(filePath);
  if (!lang) return { logCount: 0, errorHandlers: [], antiPatterns: [] };

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);

  // Count log statements
  let logCount = 0;
  for (const line of lines) {
    if (isLogStatement(line, lang)) logCount++;
  }

  // Find error handlers
  const errorHandlerResults = findErrorHandlers(lines, lang);
  const errorHandlers: ErrorHandler[] = errorHandlerResults.map((r) => ({
    file: path.relative(cwd, filePath),
    line: r.line,
    logged: r.logged,
    snippet: r.snippet,
  }));

  // Detect anti-patterns
  const antiPatterns: AntiPatternHit[] = [
    ...detectAntiPatterns(lines, lang, path.relative(cwd, filePath)),
    ...detectSwallowedErrors(lines, lang, path.relative(cwd, filePath)),
  ];

  return { logCount, errorHandlers, antiPatterns };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Run observability analysis on source files referenced by a command.
 * Returns null when no source files can be identified.
 */
export function analyseObservability(command: string, cwd: string): ObservabilityReport | null {
  // Try to find files from both command tokens and (later) command output
  let files = extractSourceFilesFromCommand(command, cwd);

  // If no files found from tokens, try broader file detection
  if (files.length === 0) {
    // Try git diff for changed files (common pattern)
    if (/\bgit\s+diff\b/.test(command) || /\bgit diff/.test(command)) {
      // git-diff-based commands produce output at runtime — handled by
      // extractSourceFilesFromOutput when we run the command. For now,
      // accept that we need at least one recognizable path.
    }
  }

  if (files.length === 0) {
    return null;
  }

  const perFile: ObservabilityReport["perFile"] = [];
  let totalLogStatements = 0;
  let totalErrorHandlers = 0;
  let errorHandlersLogged = 0;
  const allAntiPatterns: AntiPatternHit[] = [];

  for (const file of files) {
    const result = scanFile(file, cwd);
    perFile.push({
      file: path.relative(cwd, file),
      logCount: result.logCount,
      errorHandlers: result.errorHandlers.length,
      errorHandlersLogged: result.errorHandlers.filter((h) => h.logged).length,
      antiPatterns: result.antiPatterns,
    });
    totalLogStatements += result.logCount;
    totalErrorHandlers += result.errorHandlers.length;
    errorHandlersLogged += result.errorHandlers.filter((h) => h.logged).length;
    allAntiPatterns.push(...result.antiPatterns);
  }

  return {
    totalLogStatements,
    totalErrorHandlers,
    errorHandlersLogged,
    antiPatterns: allAntiPatterns,
    files: files.map((f) => path.relative(cwd, f)),
    perFile,
  };
}

/**
 * Re-analyze using command output (for commands like `git diff --name-only`
 * where the file list is in stdout, not the command tokens).
 */
export function analyseObservabilityFromOutput(
  commandOutput: string,
  cwd: string,
): ObservabilityReport | null {
  const files = extractSourceFilesFromOutput(commandOutput, cwd);
  if (files.length === 0) return null;

  const perFile: ObservabilityReport["perFile"] = [];
  let totalLogStatements = 0;
  let totalErrorHandlers = 0;
  let errorHandlersLogged = 0;
  const allAntiPatterns: AntiPatternHit[] = [];

  for (const file of files) {
    const result = scanFile(file, cwd);
    perFile.push({
      file: path.relative(cwd, file),
      logCount: result.logCount,
      errorHandlers: result.errorHandlers.length,
      errorHandlersLogged: result.errorHandlers.filter((h) => h.logged).length,
      antiPatterns: result.antiPatterns,
    });
    totalLogStatements += result.logCount;
    totalErrorHandlers += result.errorHandlers.length;
    errorHandlersLogged += result.errorHandlers.filter((h) => h.logged).length;
    allAntiPatterns.push(...result.antiPatterns);
  }

  return {
    totalLogStatements,
    totalErrorHandlers,
    errorHandlersLogged,
    antiPatterns: allAntiPatterns,
    files: files.map((f) => path.relative(cwd, f)),
    perFile,
  };
}
