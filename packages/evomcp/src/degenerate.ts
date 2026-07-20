/**
 * Degenerate solution detectors — catch weak-model Goodhart behavior.
 *
 * Evo_target.md §7: "Degenerate-solution detectors run on every candidate:
 * hardcoded test inputs, deleted assertions, broadened exception swallowing,
 * type: ignore density."
 *
 * All detectors are pure functions: (diff: string, files?: Map<string, string>)
 * → DegenerateReport. No I/O, no side effects. The caller (orchestrator or
 * solve/evolve) provides the diff and optionally file contents for deeper
 * analysis.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface DegenerateFinding {
  /** Type of degenerate pattern detected. */
  type: DegenerateType;
  /** Severity: "block" = must reject candidate, "warn" = advisory. */
  severity: "block" | "warn";
  /** Human-readable description of what was found. */
  message: string;
  /** File where the pattern was found (empty if diff-level). */
  file: string;
  /** Approximate line number in diff (0 if unknown). */
  line: number;
}

export type DegenerateType =
  | "hardcoded_test_output"
  | "deleted_assertion"
  | "broadened_catch"
  | "type_ignore_density"
  | "disabled_lint"
  | "commented_out_code"
  | "empty_test"
  | "todo_bomb";

export interface DegenerateReport {
  /** Whether the candidate passed all block-level detectors. */
  clean: boolean;
  /** All findings, block + warn. */
  findings: DegenerateFinding[];
  /** Summary for reporting in escalation/solve result. */
  summary: string;
}

// ── Thresholds ─────────────────────────────────────────────────────────

const TYPE_IGNORE_DENSITY_THRESHOLD = 0.05; // 5% of added lines
const _COMMENTED_CODE_DENSITY_THRESHOLD = 0.1; // 10% of added lines
const MIN_DIFF_LENGTH_FOR_DENSITY = 20; // lines — skip analysis on tiny diffs

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Run all degenerate-detection checks on a diff.
 *
 * @param diff - Unified diff text (git diff output).
 * @param files - Optional map of file path → file content for deeper analysis.
 * @returns DegenerateReport with all findings.
 */
export function detectDegenerate(diff: string, files?: Map<string, string>): DegenerateReport {
  const findings: DegenerateFinding[] = [];

  if (!diff?.trim()) {
    return { clean: true, findings: [], summary: "No diff to analyze." };
  }

  findings.push(...detectHardcodedTestOutputs(diff));
  findings.push(...detectDeletedAssertions(diff));
  findings.push(...detectBroadenedCatches(diff));
  findings.push(...detectTypeIgnoreDensity(diff));
  findings.push(...detectDisabledLint(diff));
  findings.push(...detectCommentedOutCode(diff));
  findings.push(...detectEmptyTests(diff));
  findings.push(...detectTodoBombs(diff));

  if (files) {
    findings.push(...detectHardcodedInFiles(diff, files));
  }

  const blockFindings = findings.filter((f) => f.severity === "block");
  const clean = blockFindings.length === 0;

  const summary = clean
    ? findings.length === 0
      ? "No degenerate patterns detected."
      : `${findings.length} advisory finding(s): ${findings.map((f) => f.type).join(", ")}`
    : `BLOCKED: ${blockFindings.length} degenerate pattern(s): ${blockFindings.map((f) => f.type).join(", ")}`;

  return { clean, findings, summary };
}

// ── Individual detectors ───────────────────────────────────────────────

/**
 * Detect test inputs that match expected outputs exactly.
 * Pattern: a test's input literal equals its expected output literal.
 * Sign of the implementer seeing the test and hardcoding the answer.
 */
function detectHardcodedTestOutputs(diff: string): DegenerateFinding[] {
  const findings: DegenerateFinding[] = [];

  // Look for patterns like:
  //   expect(fn("password123")).toBe("password123")  -- input == expected
  //   assert_eq!(fn(42), 42)  -- input == expected
  const addedLines = extractAddedLines(diff);

  for (const { line, text, file } of addedLines) {
    // Match: expect(fn("literal")).toBe("literal") or assertEquals(fn(42), 42)
    const expectRe =
      /expect\([^)]*\(["']([^"']+)["']\)[^)]*\)\.(?:toBe|toEqual|toBeTruthy|toStrictEqual)\(["']\1["']\)/;
    const match = expectRe.exec(text);
    if (match) {
      findings.push({
        type: "hardcoded_test_output",
        severity: "block",
        message: `Test input "${match[1]}" matches expected output — possible hardcoded answer.`,
        file,
        line,
      });
    }

    // Match: assertEquals(fn(42), 42)
    const eqRe = /assert(?:Equal|Eq|StrictEqual)\([^,]+\((\d+(?:\.\d+)?)\)\s*,\s*\1\)/;
    const eqMatch = eqRe.exec(text);
    if (eqMatch) {
      findings.push({
        type: "hardcoded_test_output",
        severity: "block",
        message: `Test input ${eqMatch[1]} matches expected output — possible hardcoded answer.`,
        file,
        line,
      });
    }
  }

  return findings;
}

/**
 * Detect deleted assertions in test files.
 * Counts lines starting with assert/expect/Assert that were removed.
 */
function detectDeletedAssertions(diff: string): DegenerateFinding[] {
  const findings: DegenerateFinding[] = [];
  const removedLines = extractRemovedLines(diff);

  let deletedAssertCount = 0;
  const deletedFiles = new Set<string>();

  for (const { text, file } of removedLines) {
    if (/\b(assert|expect|Assert|assertEq|assertEquals|assertThat|should|must|assert_)\b/.test(text)) {
      deletedAssertCount++;
      if (isTestFile(file)) {
        deletedFiles.add(file);
      }
    }
  }

  if (deletedAssertCount >= 3) {
    findings.push({
      type: "deleted_assertion",
      severity: "block",
      message: `${deletedAssertCount} assertion lines deleted across ${deletedFiles.size} test files.`,
      file: [...deletedFiles].join(", "),
      line: 0,
    });
  } else if (deletedAssertCount > 0) {
    findings.push({
      type: "deleted_assertion",
      severity: "warn",
      message: `${deletedAssertCount} assertion lines deleted — verify they were redundant.`,
      file: [...deletedFiles].join(", "),
      line: 0,
    });
  }

  return findings;
}

/**
 * Detect broadened exception catches.
 * Pattern: a specific catch (except ValueError) being replaced with a broad
 * catch (except Exception, catch (e), catch (...)).
 */
function detectBroadenedCatches(diff: string): DegenerateFinding[] {
  const removed = extractRemovedLines(diff);
  const added = extractAddedLines(diff);

  let removedSpecific = 0;
  let addedBroad = 0;

  for (const { text } of removed) {
    if (/\b(?:catch|except)\s*\(?\s*\w+(?:Error|Exception)\b/.test(text)) {
      removedSpecific++;
    }
  }

  for (const { text } of added) {
    if (/\b(?:catch|except)\s*\(?\s*(?:Exception|BaseException|Throwable|Error|\.\.\.|e)\s*\)?\s*[:{]\s*$/.test(text)) {
      addedBroad++;
    }
  }

  if (addedBroad > 0 && removedSpecific > 0) {
    return [
      {
        type: "broadened_catch",
        severity: "block",
        message: `${removedSpecific} specific catch(es) replaced with ${addedBroad} broad catch(es) — swallowing errors.`,
        file: "",
        line: 0,
      },
    ];
  }
  if (addedBroad > 2) {
    return [
      {
        type: "broadened_catch",
        severity: "warn",
        message: `${addedBroad} broad exception catches added — ensure they don't mask bugs.`,
        file: "",
        line: 0,
      },
    ];
  }
  return [];
}

/**
 * Detect type:ignore / @ts-expect-error / @ts-expect-error / # type: ignore density.
 * If >5% of added lines suppress type checking, flag it.
 */
function detectTypeIgnoreDensity(diff: string): DegenerateFinding[] {
  const findings: DegenerateFinding[] = [];
  const addedLines = extractAddedLines(diff);

  if (addedLines.length < MIN_DIFF_LENGTH_FOR_DENSITY) return findings;

  let suppressCount = 0;
  for (const { text } of addedLines) {
    if (/(?:@ts-ignore|@ts-expect-error|#\s*type:\s*ignore|#\s*noqa|#\s*pylint:\s*disable|#\[allow\()/.test(text)) {
      suppressCount++;
    }
  }

  const density = suppressCount / addedLines.length;
  if (density > TYPE_IGNORE_DENSITY_THRESHOLD) {
    findings.push({
      type: "type_ignore_density",
      severity: "block",
      message: `${suppressCount}/${addedLines.length} added lines suppress type checking (${(density * 100).toFixed(1)}% > ${(TYPE_IGNORE_DENSITY_THRESHOLD * 100).toFixed(0)}% threshold).`,
      file: "",
      line: 0,
    });
  } else if (suppressCount > 0) {
    findings.push({
      type: "type_ignore_density",
      severity: "warn",
      message: `${suppressCount} type/lint suppressions added — verify each is justified.`,
      file: "",
      line: 0,
    });
  }

  return findings;
}

/**
 * Detect disabled lint rules.
 * Pattern: /* eslint-disable, // biome-ignore, # ruff: noqa, etc.
 */
function detectDisabledLint(diff: string): DegenerateFinding[] {
  const findings: DegenerateFinding[] = [];
  const addedLines = extractAddedLines(diff);

  for (const { text, file, line } of addedLines) {
    if (
      /\b(?:eslint-disable(?:-next-line)?|biome-ignore|ruff:\s*noqa|pylint:\s*disable=|noinspection|#\[allow\()/.test(
        text,
      )
    ) {
      findings.push({
        type: "disabled_lint",
        severity: "block",
        message: `Lint rule disabled: ${text.trim().slice(0, 120)}`,
        file,
        line,
      });
    }
  }

  return findings;
}

/**
 * Detect commented-out code (>3 consecutive lines starting with // or #).
 */
function detectCommentedOutCode(diff: string): DegenerateFinding[] {
  const findings: DegenerateFinding[] = [];
  const addedLines = extractAddedLines(diff);

  if (addedLines.length < MIN_DIFF_LENGTH_FOR_DENSITY) return findings;

  // Find runs of 3+ consecutive commented-out lines
  let runStart = -1;
  let runCount = 0;
  const commentRe = /^\s*(?:\/\/|#|--|;)\s*\w/;

  for (let i = 0; i < addedLines.length; i++) {
    if (commentRe.test(addedLines[i].text)) {
      if (runStart === -1) runStart = i;
      runCount++;
    } else {
      if (runCount >= 3) {
        findings.push({
          type: "commented_out_code",
          severity: "warn",
          message: `${runCount} consecutive commented-out lines at line ${addedLines[runStart].line} — dead code.`,
          file: addedLines[runStart].file,
          line: addedLines[runStart].line,
        });
      }
      runStart = -1;
      runCount = 0;
    }
  }

  // Check trailing run
  if (runCount >= 3) {
    findings.push({
      type: "commented_out_code",
      severity: "warn",
      message: `${runCount} consecutive commented-out lines at line ${addedLines[runStart].line} — dead code.`,
      file: addedLines[runStart].file,
      line: addedLines[runStart].line,
    });
  }

  return findings;
}

/**
 * Detect empty test functions (test with no assertions).
 */
function detectEmptyTests(diff: string): DegenerateFinding[] {
  const findings: DegenerateFinding[] = [];
  const addedLines = extractAddedLines(diff);

  // Look for test function definitions followed by empty bodies or only pass/return
  const testFnRe =
    /\b(?:test|it|describe)\s*\(\s*["'][^"']+["']\s*,\s*(?:async\s*)?(?:\(\s*\)|function\s*\(\s*\))\s*=>(?:\s*{\s*})/;
  for (const { text, file, line } of addedLines) {
    if (testFnRe.test(text)) {
      findings.push({
        type: "empty_test",
        severity: "block",
        message: `Empty test function — no assertions.`,
        file,
        line,
      });
    }
  }

  return findings;
}

/**
 * Detect TODO/FIXME/HACK bombs in production code.
 * A "bomb" = 3+ TODOs added in a single diff in non-test files.
 */
function detectTodoBombs(diff: string): DegenerateFinding[] {
  const findings: DegenerateFinding[] = [];
  const addedLines = extractAddedLines(diff);

  const todoRe = /\b(?:TODO|FIXME|HACK|XXX|WORKAROUND)\b/i;
  let todoCount = 0;
  const todoFiles = new Set<string>();

  for (const { text, file } of addedLines) {
    if (todoRe.test(text) && !isTestFile(file)) {
      todoCount++;
      todoFiles.add(file);
    }
  }

  if (todoCount >= 3) {
    findings.push({
      type: "todo_bomb",
      severity: "warn",
      message: `${todoCount} TODO/FIXME/HACK markers in ${todoFiles.size} source file(s) — deferred work.`,
      file: [...todoFiles].join(", "),
      line: 0,
    });
  }

  return findings;
}

/**
 * Deep file analysis: check if added test code contains hardcoded values
 * that match expected outputs from the same test.
 */
function detectHardcodedInFiles(_diff: string, _files: Map<string, string>): DegenerateFinding[] {
  // Reserved for future per-file deeper analysis.
  // Currently, the diff-level detector catches the most common patterns.
  return [];
}

// ── Diff parsing helpers ───────────────────────────────────────────────

interface DiffLine {
  text: string;
  line: number;
  file: string;
}

/**
 * Extract all added lines (+ prefix) from a unified diff.
 */
function extractAddedLines(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let currentFile = "";
  let lineNum = 0;

  for (const raw of diff.split("\n")) {
    // Track file header: +++ b/path/to/file
    const fileMatch = /^\+\+\+\s+b\/(.+)$/.exec(raw);
    if (fileMatch) {
      currentFile = fileMatch[1];
      lineNum = 0;
      continue;
    }

    // Track hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(raw);
    if (hunkMatch) {
      lineNum = Number.parseInt(hunkMatch[1], 10);
      continue;
    }

    // Added line: +
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      lines.push({ text: raw.slice(1), line: lineNum, file: currentFile });
      lineNum++;
    } else if (!(raw.startsWith("-") || raw.startsWith("@@"))) {
      // Context line (no prefix or space prefix) — increment line counter
      lineNum++;
    }
  }

  return lines;
}

/**
 * Extract all removed lines (- prefix) from a unified diff.
 */
function extractRemovedLines(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let currentFile = "";
  let lineNum = 0;

  for (const raw of diff.split("\n")) {
    const fileMatch = /^\+\+\+\s+b\/(.+)$/.exec(raw);
    if (fileMatch) {
      currentFile = fileMatch[1];
      lineNum = 0;
      continue;
    }

    const hunkMatch = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(raw);
    if (hunkMatch) {
      lineNum = Number.parseInt(hunkMatch[1], 10);
      continue;
    }

    // Removed line: -
    if (raw.startsWith("-") && !raw.startsWith("---")) {
      lines.push({ text: raw.slice(1), line: lineNum, file: currentFile });
      lineNum++;
    } else if (!(raw.startsWith("+") || raw.startsWith("@@"))) {
      lineNum++;
    }
  }

  return lines;
}

// ── Helpers ────────────────────────────────────────────────────────────

const TEST_FILE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /\.test\.jsx?$/,
  /\.spec\.jsx?$/,
  /\.test\.py$/,
  /\.spec\.py$/,
  /\.test\.rs$/,
  /\.test\.go$/,
  /_test\./,
  /\/tests?\//,
  /\/__tests__\//,
  /\/spec\//,
  /\/test\//,
  /Test\./,
];

function isTestFile(file: string): boolean {
  if (!file) return false;
  return TEST_FILE_PATTERNS.some((p) => p.test(file));
}
