import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

/**
 * Assertion quality analysis for test files. Detects proofs that only grep for
 * keywords ("assert", "expect") instead of verifying that tests contain real,
 * non-trivial behavioural assertions.
 *
 * An assertion is "trivial" when it evaluates a literal constant against itself
 * or another constant — it always passes regardless of any production logic.
 * Examples:
 *   assert True          expect(true).toBe(true)
 *   assert 1 == 1        assert.equal(0, 0)
 *   self.assertTrue(True)
 */

export interface AssertionReport {
  /** Total assertion-like lines found across all scanned files. */
  total: number;
  /** Lines that match a known-trivial pattern (constant-on-constant). */
  trivial: number;
  /** total - trivial: assertions that are NOT known-trivial. */
  nonTrivial: number;
  /** Files scanned. */
  files: string[];
  /** Per-file breakdown. */
  perFile: Array<{ file: string; total: number; trivial: number }>;
}

// ── Trivial assertion patterns ────────────────────────────────────────
//
// Each pattern matches a line where BOTH sides of the assertion are literal
// constants — no variable, no function call, no computed value. These tests
// pass unconditionally and exercise zero production logic.

const PY_TRIVIAL = [
  // assert True / assert False / assert None
  /^\s*assert\s+(True|False|None)\s*(#.*)?$/,
  // assert 1, assert 3.14, assert "hello"
  /^\s*assert\s+(True|False|None|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*(#.*)?$/,
  // assert CONST OP CONST (both sides literal)
  /^\s*assert\s+(True|False|None|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s* {4}(==|!=|is|is\s+not|in|not\s+in|[<>]=?)\s* {4}(True|False|None|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*(#.*)?$/,
  // self.assertX(CONST, CONST)
  /^\s*self\.assert(?:True|False|Equal|NotEqual|Is|IsNot|In|NotIn|Greater|Less|AlmostEqual|Regex|Raises)\s*\(\s*(True|False|None|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*(?:,\s*(True|False|None|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*)?\)\s*(#.*)?$/,
];

const JS_TRIVIAL = [
  // expect(CONST).toXxx(CONST) — inline, no ^\s* anchor
  /expect\s*\(\s*(true|false|null|undefined|\d+(?:\.\d+)?|"[^"]*"|'[^']*'|`[^`]*`)\s*\)\s*\.\s*(?:not\s*\.\s*)?(?:toBe|toEqual|toBeTruthy|toBeFalsy|toBeNull|toBeUndefined|toStrictEqual|toMatchObject|toContain|toHaveLength)\s*\(\s*(true|false|null|undefined|\d+(?:\.\d+)?|"[^"]*"|'[^']*'|`[^`]*`)\s*\)/,
  // assert.equal(CONST, CONST) / assert.strictEqual(CONST, CONST)
  /assert\.(?:equal|strictEqual|deepEqual|deepStrictEqual|notEqual|notStrictEqual|notDeepEqual)\s*\(\s*(true|false|null|undefined|\d+(?:\.\d+)?|"[^"]*"|'[^']*'|`[^`]*`)\s*,\s*(true|false|null|undefined|\d+(?:\.\d+)?|"[^"]*"|'[^']*'|`[^`]*`)\s*\)/,
  // assert.ok(true) / assert.fail()
  /assert\.(?:ok|fail)\s*\(\s*(true|false)\s*\)/,
];

// ── Assertion-detection patterns (broad) ──────────────────────────────

const PY_ASSERT = /^\s*(assert\b|self\.assert)/;
// No ^\s* anchor — JS/TS assertions are often inline (e.g. inside test callbacks)
const JS_ASSERT = /(expect\s*\(|assert\.)/;

// ── Helpers ───────────────────────────────────────────────────────────

function _isTrivial(line: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(line));
}

function _isAssertion(line: string, detector: RegExp): boolean {
  return detector.test(line);
}

function classifyLine(
  line: string,
  detector: RegExp,
  trivialPatterns: RegExp[],
): { count: number; trivialCount: number } {
  // Count all assertion occurrences on the line (JS/TS often has multiple assertions per line)
  const globalDetector = new RegExp(detector.source, "g");
  const matches = line.match(globalDetector);
  if (!matches) return { count: 0, trivialCount: 0 };
  // Trivial detection stays boolean per-line (prevents double-counting from overlapping patterns)
  const lineHasTrivial = trivialPatterns.some((p) => p.test(line));
  return { count: matches.length, trivialCount: lineHasTrivial ? matches.length : 0 };
}

function languageForFile(file: string): "py" | "js" | null {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".py") return "py";
  if ([".js", ".ts", ".mjs", ".cjs", ".mts", ".cts", ".jsx", ".tsx"].includes(ext)) return "js";
  return null;
}

function scanFile(file: string): { total: number; trivial: number } {
  const lang = languageForFile(file);
  if (!lang) return { total: 0, trivial: 0 };

  const detector = lang === "py" ? PY_ASSERT : JS_ASSERT;
  const trivialPatterns = lang === "py" ? PY_TRIVIAL : JS_TRIVIAL;

  const content = readFileSync(file, "utf-8");
  const lines = content.split(/\r?\n/);
  let total = 0;
  let trivial = 0;

  for (const line of lines) {
    const result = classifyLine(line, detector, trivialPatterns);
    total += result.count;
    trivial += result.trivialCount;
  }

  return { total, trivial };
}

// ── File discovery ────────────────────────────────────────────────────

const TEST_FILE_PATTERNS = [
  /^test_.*\.py$/,
  /^.*_test\.py$/,
  /\.test\.(ts|js|tsx|jsx|mts|mjs)$/,
  /\.spec\.(ts|js|tsx|jsx|mts|mjs)$/,
];

function isTestFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return TEST_FILE_PATTERNS.some((p) => p.test(base));
}

/**
 * Extract file paths referenced in a test command. Looks for positional
 * arguments that match common test-file patterns.
 */
function extractTestFilesFromCommand(command: string, cwd: string): string[] {
  const tokens = command.split(/\s+/);
  const files: string[] = [];

  for (const token of tokens) {
    // Skip flags and option-like tokens
    if (token.startsWith("-") || token.startsWith("--")) continue;
    // Skip known runner binaries/commands
    if (/^(python|python3?|pytest|node|npm|npx|pnpm|yarn|jest|vitest|mocha|ts-node|tsx)$/.test(token)) continue;
    // Skip subcommand names
    if (/^(test|run|exec)$/.test(token)) continue;

    // Check if it looks like a path
    if (token.includes(".") || token.includes("/") || token.includes("\\")) {
      const resolved = path.resolve(cwd, token);
      if (existsSync(resolved) && isTestFile(resolved)) {
        files.push(resolved);
      }
      // Also try glob-style: token might be tests/test_*.py — resolve the directory
      // part and check for matching files.
      const dir = path.dirname(resolved);
      const pat = path.basename(resolved);
      if (existsSync(dir) && pat.includes("*")) {
        // Simple wildcard matching in the directory
        try {
          const { readdirSync } = require("node:fs");
          const entries = readdirSync(dir);
          const regex = new RegExp(`^${pat.replace(/\*/g, ".*").replace(/\./g, "\\.")}$`);
          for (const entry of entries) {
            if (regex.test(entry)) {
              const full = path.join(dir, entry);
              if (isTestFile(full)) files.push(full);
            }
          }
        } catch (err: unknown) {
          // Directory unreadable — skip
          const msg = err instanceof Error ? err.message : String(err);
          console.error("assertions: unreadable dir", { dir, err: msg });
        }
      }
    }
  }

  return [...new Set(files)];
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Scan test files referenced in a command and produce an assertion-quality
 * report. Returns null when no test files can be identified from the command.
 */
export function analyseAssertions(command: string, cwd: string): AssertionReport | null {
  const files = extractTestFilesFromCommand(command, cwd);

  if (files.length === 0) {
    return null;
  }

  const perFile: Array<{ file: string; total: number; trivial: number }> = [];
  let total = 0;
  let trivial = 0;

  for (const file of files) {
    const counts = scanFile(file);
    perFile.push({ file: path.relative(cwd, file), ...counts });
    total += counts.total;
    trivial += counts.trivial;
  }

  return {
    total,
    trivial,
    nonTrivial: total - trivial,
    files: files.map((f) => path.relative(cwd, f)),
    perFile,
  };
}
