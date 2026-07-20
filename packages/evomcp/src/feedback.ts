/**
 * Feedback compiler — structured diagnostic parsing with context windows.
 *
 * Evo-goals.md: "median repair-feedback size should not exceed a few hundred
 * tokens of relevant material." This module:
 *  1. Parses raw stderr/stdout into structured `Diagnostic[]`
 *  2. Reads 20-line context windows from source files
 *  3. Groups by file, deduplicates, sorts by severity
 *  4. Caps total output at ~300 tokens of relevant material
 *  5. Falls back to raw truncation for unparseable output
 *
 * Builds on parseDiagnostics from gates.ts; adds context reading + token budgeting.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Diagnostic } from "./types.js";

// ── Constants ──────────────────────────────────────────────────────────

/** Lines of context to read around each diagnostic. */
const CONTEXT_WINDOW = 20;
/** Max total characters in compiled feedback (before token estimation). */
const MAX_FEEDBACK_CHARS = 2000;
/** Rough tokens-per-char estimate for English code output. */
const TOKENS_PER_CHAR = 0.25;

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Compile raw command output into token-budgeted, context-rich feedback.
 *
 * @param raw - Raw stdout/stderr from a verify/build/lint command.
 * @param cwd - Working directory for resolving relative file paths.
 * @param gateType - Tag for the diagnostic oracle_type field.
 * @returns Structured diagnostic array, sorted severity-desc, capped to budget.
 */
export function compileFeedback(raw: string, cwd: string, gateType: string): Diagnostic[] {
  if (!raw?.trim()) return [];

  const parsed = parseAllDiagnostics(raw, gateType);
  if (parsed.length === 0) {
    return [fallbackDiagnostic(raw, gateType)];
  }

  // Attach context windows
  const withContext = attachContextWindows(parsed, cwd);

  // Deduplicate (same file + line + message prefix)
  const deduped = deduplicateDiagnostics(withContext);

  // Sort: errors first, then warnings, then info; within severity, by file+line
  deduped.sort(compareDiagnostics);

  // Cap to token budget
  return capToTokenBudget(deduped);
}

/**
 * Estimate token count for a diagnostic array.
 * Rough heuristic: 4 chars ≈ 1 token for English code text.
 */
export function estimateTokens(diagnostics: Diagnostic[]): number {
  let chars = 0;
  for (const d of diagnostics) {
    chars += d.file.length + d.message.length + d.context.length + 10; // +10 for separators
  }
  return Math.ceil(chars * TOKENS_PER_CHAR);
}

/**
 * Compile feedback for a specific file, limiting to diagnostics in that file.
 */
export function compileFileFeedback(raw: string, cwd: string, filePath: string, gateType: string): Diagnostic[] {
  const all = compileFeedback(raw, cwd, gateType);
  return all.filter((d) => d.file === filePath || d.file.endsWith(filePath));
}

// ── Parsing ────────────────────────────────────────────────────────────

/**
 * Parse ALL supported diagnostic formats from raw output.
 * Extends gates.ts parseDiagnostics with additional formats:
 *   - Python tracebacks
 *   - Rust compiler errors
 *   - Go compiler errors
 *   - Jest/Vitest assertion failures
 */
function parseAllDiagnostics(output: string, gateType: string): Diagnostic[] {
  if (!output?.trim()) return [];

  const diagnostics: Diagnostic[] = [];
  const lines = output.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let match: RegExpExecArray | null;

    // TypeScript: /path/file.ts(42,10): error TS2345: message
    const tsRe = /^(.+?)\((\d+),\d+\):\s+(error|warning)\s+TS\d+:\s+(.+)$/;
    match = tsRe.exec(line);
    if (match) {
      diagnostics.push(makeDiag(match[1], Number(match[2]), match[3] as "error" | "warning", match[4], gateType));
      if (diagnostics.length >= 100) break;
      continue;
    }

    // ESLint: path/file.js:10:5: error "rule-name" message
    const eslintRe = /^([^:]+):(\d+):(\d+):\s+(error|warning)\s+(.+)$/;
    match = eslintRe.exec(line);
    if (match) {
      const sev = match[4] === "error" ? "error" : "warning";
      diagnostics.push(makeDiag(match[1], Number(match[2]), sev, match[5], gateType));
      if (diagnostics.length >= 100) break;
      continue;
    }

    // Biome: path/file.ts:10:5 error[noUnusedVariables] message
    //        path/file.ts:10:5 warning/lint/syntaxError message
    const biomeRe = /^([^:]+):(\d+):(\d+)\s+(error|warning|info)\s+(.+)$/;
    match = biomeRe.exec(line);
    if (match) {
      diagnostics.push(
        makeDiag(match[1], Number(match[2]), match[4] as "error" | "warning" | "info", match[5], gateType),
      );
      if (diagnostics.length >= 100) break;
      continue;
    }

    // Python traceback:   File "path/file.py", line 42, in <module>
    const pyRe = /^\s*File\s+"(.+?)",\s+line\s+(\d+)/;
    match = pyRe.exec(line);
    if (match) {
      diagnostics.push(makeDiag(match[1], Number(match[2]), "error", line, gateType));
      continue;
    }

    // Rust: error[E0001]: message
    //        --> path/file.rs:42:10
    const rustErrRe = /^(?:error|warning)\[(\w+)\]:\s+(.+)$/;
    match = rustErrRe.exec(line);
    if (match) {
      // The next line should have the file location: --> file.rs:line:col
      diagnostics.push(makeDiag("", 0, "error", `${match[1]}: ${match[2]}`, gateType));
      continue;
    }
    const rustLocRe = /^\s*-->\s*(.+?):(\d+):(\d+)$/;
    match = rustLocRe.exec(line);
    if (match && diagnostics.length > 0) {
      // Update the most recent diagnostic with location info
      const prev = diagnostics[diagnostics.length - 1];
      prev.file = match[1];
      prev.line = Number(match[2]);
      continue;
    }

    // Go: path/file.go:42:10: error message
    const goRe = /^(.+?\.go):(\d+):(\d+):\s+(.+)$/;
    match = goRe.exec(line);
    if (match) {
      diagnostics.push(makeDiag(match[1], Number(match[2]), "error", match[4], gateType));
      if (diagnostics.length >= 100) break;
      continue;
    }

    // Jest/Vitest: ● TestName › subtest
    //              expect(received).toBe(expected)
    //              Expected: "foo" Received: "bar"
    // These don't have clean file:line on a single line — handled by
    // the generic assertion-failure parser below.
    const jestFailRe = /^\s*(?:Expected|Received|expect\(|assert)/;
    match = jestFailRe.exec(line);
    if (match) {
      // Look for a preceding file:line pattern in recent lines
      diagnostics.push(makeDiag("", 0, "error", line, gateType));
      if (diagnostics.length >= 100) break;
    }
  }

  return diagnostics;
}

function makeDiag(
  file: string,
  line: number,
  severity: "error" | "warning" | "info",
  message: string,
  gateType: string,
): Diagnostic {
  return {
    file,
    line,
    severity,
    message: message.slice(0, 500),
    context: "",
    oracle_type: gateType,
  };
}

// ── Context windows ────────────────────────────────────────────────────

/**
 * Attach 20-line context windows from source files to each diagnostic.
 * Reads the source file and extracts lines around the reported line number.
 * Skips context when file path is empty or doesn't exist on disk.
 *
 * Memory-safe: only reads each unique file once, caches content.
 */
function attachContextWindows(diagnostics: Diagnostic[], cwd: string): Diagnostic[] {
  const fileCache = new Map<string, string[] | null>();

  for (const d of diagnostics) {
    if (!d.file || d.line <= 0) continue;

    const resolved = path.resolve(cwd, d.file);

    let lines: string[] | null | undefined = fileCache.get(resolved);
    if (lines === undefined) {
      try {
        if (fs.existsSync(resolved)) {
          const content = fs.readFileSync(resolved, "utf-8");
          lines = content.split("\n");
        } else {
          lines = null;
        }
      } catch {
        lines = null;
      }
      fileCache.set(resolved, lines);
    }

    if (!lines || lines.length === 0) continue;

    const start = Math.max(0, d.line - 1 - Math.floor(CONTEXT_WINDOW / 2));
    const end = Math.min(lines.length, start + CONTEXT_WINDOW);

    const window = lines.slice(start, end);
    const numbered = window.map((l, i) => `${start + i + 1}: ${l}`).join("\n");
    d.context = numbered.slice(0, 1000); // cap context to 1000 chars
  }

  return diagnostics;
}

// ── Deduplication ──────────────────────────────────────────────────────

/**
 * Remove duplicate diagnostics: same file + line + first 80 chars of message.
 * Keeps first occurrence.
 */
function deduplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const result: Diagnostic[] = [];

  for (const d of diagnostics) {
    const key = `${d.file}:${d.line}:${d.message.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(d);
  }

  return result;
}

// ── Sorting ────────────────────────────────────────────────────────────

/**
 * Sort diagnostics: errors first, then warnings, then info.
 * Within each severity: by file path, then line number.
 */
function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  const sevOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
  const sevDiff = (sevOrder[a.severity] ?? 99) - (sevOrder[b.severity] ?? 99);
  if (sevDiff !== 0) return sevDiff;

  const fileDiff = a.file.localeCompare(b.file);
  if (fileDiff !== 0) return fileDiff;

  return a.line - b.line;
}

// ── Token budget capping ───────────────────────────────────────────────

/**
 * Cap diagnostic array to ~300 tokens. Drops lowest-severity diagnostics
 * first, then truncates message length on remaining ones.
 */
function capToTokenBudget(diagnostics: Diagnostic[]): Diagnostic[] {
  if (diagnostics.length === 0) return diagnostics;

  let currentTokens = estimateTokens(diagnostics);
  if (currentTokens <= 300) return diagnostics;

  // Strategy 1: drop info diagnostics entirely
  const withoutInfo = diagnostics.filter((d) => d.severity !== "info");
  if (withoutInfo.length > 0) {
    currentTokens = estimateTokens(withoutInfo);
    if (currentTokens <= 300) return withoutInfo;
  }

  // Strategy 2: drop warnings, keep only errors
  const onlyErrors = diagnostics.filter((d) => d.severity === "error");
  if (onlyErrors.length > 0) {
    currentTokens = estimateTokens(onlyErrors);
    if (currentTokens <= 300) return onlyErrors;
  }

  // Strategy 3: truncate context + message on remaining errors
  return onlyErrors.map((d) => ({
    ...d,
    context: d.context.slice(0, 200),
    message: d.message.slice(0, 100),
  }));
}

// ── Fallback ───────────────────────────────────────────────────────────

/**
 * Wrap unparseable output as a single raw diagnostic.
 */
export function fallbackDiagnostic(raw: string, gateType: string): Diagnostic {
  return {
    file: "",
    line: 0,
    severity: "error",
    message: raw.slice(0, MAX_FEEDBACK_CHARS),
    context: "",
    oracle_type: gateType,
  };
}
