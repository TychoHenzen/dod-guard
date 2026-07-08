import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { DodDocument, CheckResult, LeafResult, Predicate, TaskNode } from "./types.js";
import { perProofFingerprint } from "./manual.js";
import { extractNumber } from "./regression.js";
import { analyseAssertions } from "./assertions.js";
import { analyseObservability, analyseObservabilityFromOutput } from "./observability.js";
import { analyseBrevity, analyseBrevityFromOutput, DEFAULT_BREVITY_OPTS, type BrevityOpts } from "./brevity.js";

const execAsync = promisify(exec);

const TIMEOUT_MS = 120_000;

// ── Tree utilities ────────────────────────────────────────────────────

/**
 * Walk the TaskNode tree depth-first, collecting every concrete leaf
 * (refinement === "concrete", no children) with its dot-separated path.
 * Draft leaves and task groups are excluded.
 */
export function flattenConcreteLeaves(
  nodes: TaskNode[],
  parentPath?: string,
): { node: TaskNode; node_path: string }[] {
  const results: { node: TaskNode; node_path: string }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      results.push(...flattenConcreteLeaves(node.children, currentPath));
    } else if (node.refinement === "concrete") {
      results.push({ node, node_path: currentPath });
    }
    // Draft leaves are intentionally skipped
  }
  return results;
}

/** True when any node in the subtree is a draft leaf (refinement === "draft"). */
export function hasDraftNodes(nodes: TaskNode[]): boolean {
  for (const node of nodes) {
    if (node.refinement === "draft") return true;
    if (node.children && hasDraftNodes(node.children)) return true;
  }
  return false;
}

/** Find a node by its dot-separated path, e.g. "0.children.1.children.2". */
export function findNodeByPath(nodes: TaskNode[], path: string): TaskNode | null {
  if (!path) return null;
  const parts = path.split(".");
  let current: TaskNode[] = nodes;
  for (let i = 0; i < parts.length; i++) {
    // Every other segment is "children" (skip it)
    if (parts[i] === "children") continue;
    const idx = Number(parts[i]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) return null;
    const node = current[idx];
    if (i === parts.length - 1 || (i === parts.length - 2 && parts[parts.length - 1] === "children")) {
      return node;
    }
    if (!node.children) return null;
    current = node.children;
  }
  return null;
}

/**
 * True when the predicate type requires an executable command that runs on
 * the host OS. Out-of-band types (manual, review) are verified by humans and
 * never need tool-resolution checks.
 */
export function isExecutablePredicate(type: string): boolean {
  return type !== "manual" && type !== "review";
}

/** Collect commands from all concrete leaves that need OS validation. */
export function extractExecutableCommands(nodes: TaskNode[]): string[] {
  const cmds: string[] = [];
  for (const { node } of flattenConcreteLeaves(nodes)) {
    if (node.command && node.predicate && isExecutablePredicate(node.predicate.type)) {
      cmds.push(node.command);
    }
  }
  return cmds;
}

/** @deprecated Use extractExecutableCommands instead. */
export const extractCommands = extractExecutableCommands;

/** True when every leaf in the subtree is concrete (no drafts remaining). */
export function isBranchLocked(nodes: TaskNode[]): boolean {
  return !hasDraftNodes(nodes);
}

/** Count draft leaves in a subtree. */
export function countDraftNodes(nodes: TaskNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.refinement === "draft") count++;
    if (node.children) count += countDraftNodes(node.children);
  }
  return count;
}

// ── Mutation output parsing ───────────────────────────────────────────

/**
 * Extract the surviving-mutant count from a mutation tool's combined output.
 */
export function parseSurvivors(output: string): number | null {
  for (const parser of [parseStryker, parseMutmut, parseCargoMutants]) {
    const survivors = parser(output);
    if (survivors !== null) return survivors;
  }
  return null;
}

function parseStryker(output: string): number | null {
  const lines = output.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.includes("|") && /#\s*survived/i.test(l));
  if (headerIdx === -1) return null;
  const headerCells = lines[headerIdx].split("|").map((c) => c.trim().toLowerCase());
  const col = headerCells.findIndex((c) => /survived/.test(c));
  if (col === -1) return null;
  const dataLine = lines.find((l) => l.includes("|") && l.trim().toLowerCase().startsWith("all files"));
  if (!dataLine) return null;
  const value = Number(dataLine.split("|").map((c) => c.trim())[col]);
  return Number.isFinite(value) ? value : null;
}

function parseMutmut(output: string): number | null {
  const match = output.match(/🙁[^\d]*(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseCargoMutants(output: string): number | null {
  const match = output.match(/(\d+)\s+missed\b/);
  return match ? Number(match[1]) : null;
}

// ── Proof-set fingerprint ─────────────────────────────────────────────

/**
 * Proof-set fingerprint for tamper detection. Hashes every concrete leaf's
 * command|type|value (+ advisory and lower_is_better when present).
 * Draft nodes excluded — nothing to hash. Grows as leaves are refined.
 */
export function computeProofFingerprint(roots: TaskNode[]): string {
  const leaves = flattenConcreteLeaves(roots);
  if (leaves.length === 0) return "";
  const data = leaves
    .map(({ node }) => {
      let line = `${node.command}|${node.predicate!.type}|${node.predicate!.value ?? ""}`;
      if (node.predicate!.lower_is_better !== undefined) line += `|lib:${node.predicate!.lower_is_better}`;
      if (node.advisory !== undefined) line += `|adv:${node.advisory}`;
      return line;
    })
    .join("\n");
  return createHash("sha256").update(data).digest("hex").slice(0, 12);
}

// ── Predicate evaluation ──────────────────────────────────────────────

function evaluatePredicate(
  predicate: Predicate,
  exitCode: number,
  stdout: string,
): boolean {
  switch (predicate.type) {
    case "exit_code":
      return exitCode === (predicate.value as number);
    case "exit_code_not":
      return exitCode !== (predicate.value as number);
    case "output_contains":
      return stdout.includes(predicate.value as string);
    case "output_matches":
      return new RegExp(predicate.value as string, "m").test(stdout);
    case "output_not_contains":
      return !stdout.includes(predicate.value as string);
    case "output_not_matches":
      return !new RegExp(predicate.value as string, "m").test(stdout);
    case "tdd":
      return exitCode === ((predicate.value as number) ?? 0);
    case "manual":
    case "review":
    case "mutation":
    case "regression":
    case "assertions":
    case "streamline":
    case "observability":
    case "brevity":
      return true;
    default:
      return false;
  }
}

// ── Command execution ─────────────────────────────────────────────────

async function runCommand(command: string, cwd: string): Promise<{
  exitCode: number; combined: string; duration: number;
  error?: string; killed?: boolean; notFound?: boolean;
}> {
  const start = Date.now();
  try {
    const shellCmd = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      shell: shellCmd,
      windowsHide: true,
    });
    return { exitCode: 0, combined: (stdout + stderr).slice(0, 4000), duration: Date.now() - start };
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    if (process.env.DOD_STORE_DIR) console.error("checker: exec failed", { cmd: command.slice(0, 80), err: msg });
    const execErr = err as { code?: number; stdout?: string; stderr?: string; killed?: boolean; message?: string };
    const exitCode = execErr.code ?? 1;
    const stdout = (execErr.stdout ?? "") as string;
    const stderr = (execErr.stderr ?? "") as string;
    const combined = (stdout + stderr).slice(0, 4000);

    if (execErr.killed) {
      return { exitCode, combined: `TIMEOUT after ${TIMEOUT_MS}ms`, duration, error: "Process killed due to timeout", killed: true };
    }

    const notFound = exitCode === 127 || exitCode === 9009
      || /not recognized|command not found|no such file/i.test(stderr + (execErr.message ?? ""));
    if (notFound) {
      return { exitCode, combined, duration, error: `Command not found or not executable (exit ${exitCode})`, notFound: true };
    }

    return { exitCode, combined, duration, error: stderr.slice(0, 2000) || undefined };
  }
}

// ── Proof execution ───────────────────────────────────────────────────

async function executeProof(node: TaskNode, cwd: string, execFn?: typeof runCommand): Promise<LeafResult> {
  const cmd = node.command!;
  const leafBase = {
    node_path: "",
    id: node.id,
    title: node.title,
    description: node.description!,
    command: cmd,
  };

  // Out-of-band proofs (manual, review)
  if (node.predicate!.type === "manual" || node.predicate!.type === "review") {
    const isReview = node.predicate!.type === "review";
    const label = isReview ? "Code review" : "Manual verification";
    const fingerprint = perProofFingerprint(node);
    const mr = node.manual_result;

    if (mr && mr.proof_fingerprint === fingerprint) {
      const output = `${label} ${mr.answer.toUpperCase()} (via dod_verify) at ${mr.confirmed_at} via ${mr.channel}${mr.note ? ` — "${mr.note}"` : ""}`;
      return {
        ...leafBase,
        status: mr.answer,
        output,
        error: mr.answer === "fail" ? `${label} was confirmed as failing by the human.` : undefined,
      };
    }

    return {
      ...leafBase,
      status: "skipped",
      output: `${label} not yet verified — call dod_verify(dod_id, "${node.id}") to request human confirmation.`,
    };
  }

  const run = await (execFn ?? runCommand)(cmd, cwd);

  if (run.killed || run.notFound) {
    return {
      ...leafBase,
      status: "fail",
      output: run.combined,
      error: run.error,
      exit_code: run.exitCode,
      duration_ms: run.duration,
    };
  }

  // Mutation predicate
  if (node.predicate!.type === "mutation") {
    const maxAllowed = (node.predicate!.value as number) ?? 0;
    const survivors = parseSurvivors(run.combined);
    if (survivors === null) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: "could not parse mutation results (no recognized Stryker/mutmut/cargo-mutants summary)",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }
    const passed = survivors <= maxAllowed;
    return {
      ...leafBase,
      status: passed ? "pass" : "fail",
      output: run.combined,
      error: passed ? undefined : `mutation: ${survivors} surviving mutant(s) exceeds the allowed maximum of ${maxAllowed}`,
      exit_code: run.exitCode,
      duration_ms: run.duration,
    };
  }

  // Regression predicate
  if (node.predicate!.type === "regression") {
    const measured = extractNumber(run.combined, node.predicate!.extract);
    if (measured === null) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: "regression: could not parse a metric number from output (fail-safe — never auto-passes)",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    if (node.baseline_value === undefined) {
      node.baseline_value = measured;
      node.baseline_captured_at = new Date().toISOString();
      return {
        ...leafBase,
        status: "pass",
        output: run.combined,
        error: `regression: baseline captured (N0=${measured}). Re-run after the change to compare.`,
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    const baseline = node.baseline_value;
    const tol = (node.predicate!.value as number) ?? 0;
    const lowerIsBetter = node.predicate!.lower_is_better ?? true;
    const passed = lowerIsBetter
      ? measured <= baseline * (1 + tol)
      : measured >= baseline * (1 - tol);

    const direction = lowerIsBetter ? "<=" : ">=";
    const threshold = lowerIsBetter ? baseline * (1 + tol) : baseline * (1 - tol);
    return {
      ...leafBase,
      status: passed ? "pass" : "fail",
      output: run.combined,
      error: passed
        ? undefined
        : `regression: ${measured} fails ${direction} ${threshold} (baseline ${baseline}, tolerance ${tol})`,
      exit_code: run.exitCode,
      duration_ms: run.duration,
    };
  }

  // Streamline predicate
  if (node.predicate!.type === "streamline") {
    const maxAllowed = (node.predicate!.value as number) ?? 0;

    if (run.exitCode > 1) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: `streamline: search command failed with exit code ${run.exitCode} (fail-safe — never auto-passes on tool errors)`,
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    if (run.exitCode === 1) {
      return {
        ...leafBase,
        status: "pass",
        output: run.combined,
        error: "streamline: no matches — old code fully removed",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    const matchCount = run.combined
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .length;

    const passed = matchCount <= maxAllowed;
    return {
      ...leafBase,
      status: passed ? "pass" : "fail",
      output: run.combined,
      error: passed
        ? `streamline: ${matchCount} match(es) ≤ allowed ${maxAllowed}`
        : `streamline: ${matchCount} remaining reference(s) exceeds allowed maximum of ${maxAllowed} — old code has not been fully removed`,
      exit_code: run.exitCode,
      duration_ms: run.duration,
    };
  }

  // Assertions predicate
  if (node.predicate!.type === "assertions") {
    const minNonTrivial = (node.predicate!.value as number) ?? 1;
    const report = analyseAssertions(cmd, cwd);

    const exitPass = run.exitCode === 0;
    const noFiles = !report;
    const tooFew = report && report.nonTrivial < minNonTrivial;
    const allTrivial = report && report.total > 0 && report.nonTrivial === 0;

    if (!exitPass) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: `tests failed with exit code ${run.exitCode}${report ? `. Test files have ${report.total} assertion(s), ${report.nonTrivial} non-trivial.` : ""}`,
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    if (noFiles) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: "assertions: could not identify any test files from the command. Ensure the command references test files by path (e.g. `python -m pytest tests/test_foo.py`).",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    if (allTrivial) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: [
          `ASSERTION QUALITY FAIL: all ${report.total} assertion(s) in ${report.files.length} test file(s) are trivial (constant-on-constant).`,
          "These tests pass unconditionally and exercise zero production logic.",
          ...report.perFile.map((f) => `  ${f.file}: ${f.total} assertion(s), ${f.trivial} trivial`),
          "Replace trivial assertions with behavioural checks against real inputs/outputs.",
        ].join("\n"),
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    if (tooFew) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: [
          `assertions: only ${report.nonTrivial} non-trivial assertion(s) found across ${report.files.length} test file(s), need at least ${minNonTrivial}.`,
          ...report.perFile.map((f) => `  ${f.file}: ${f.total} total, ${f.trivial} trivial, ${f.total - f.trivial} non-trivial`),
        ].join("\n"),
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    return {
      ...leafBase,
      status: "pass",
      output: run.combined,
      error: `assertions: ${report.nonTrivial} non-trivial assertion(s) across ${report.files.length} test file(s) (${report.total} total, ${report.trivial} trivial)`,
      exit_code: run.exitCode,
      duration_ms: run.duration,
    };
  }

  // Observability predicate
  if (node.predicate!.type === "observability") {
    const minLogStatements = (node.predicate!.value as number) ?? 1;
    let report = analyseObservability(cmd, cwd);
    if (!report) {
      report = analyseObservabilityFromOutput(run.combined, cwd);
    }

    if (!report) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: "observability: could not identify any source files from the command or its output. Ensure the command references source files by path (e.g. `git diff --name-only HEAD~1 -- '*.ts'` or `python -m pytest tests/test_foo.py`).",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    const tooFewLogs = report.totalLogStatements < minLogStatements;
    const unloggedErrors = report.totalErrorHandlers - report.errorHandlersLogged;
    const hasAntiPatterns = report.antiPatterns.length > 0;

    if (!tooFewLogs && unloggedErrors === 0 && !hasAntiPatterns) {
      const lines: string[] = [
        `observability: ${report.totalLogStatements} log statement(s) across ${report.files.length} file(s)`,
        `  error handlers: ${report.totalErrorHandlers} total, ${report.errorHandlersLogged} logged`,
      ];
      for (const f of report.perFile) {
        lines.push(`  ${f.file}: ${f.logCount} logs, ${f.errorHandlers} handlers (${f.errorHandlersLogged} logged)${f.antiPatterns.length > 0 ? `, ${f.antiPatterns.length} anti-pattern(s)` : ""}`);
      }
      return {
        ...leafBase,
        status: "pass",
        output: run.combined,
        error: lines.join("\n"),
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    const errors: string[] = [];
    if (tooFewLogs) {
      errors.push(`OBSERVABILITY FAIL: only ${report.totalLogStatements} log statement(s) found across ${report.files.length} file(s), need at least ${minLogStatements}.`);
    }
    if (unloggedErrors > 0) {
      errors.push(`OBSERVABILITY FAIL: ${unloggedErrors} error handler(s) without logging across ${report.files.length} file(s). Every catch/except/Err branch must log before handling.`);
    }
    if (hasAntiPatterns) {
      errors.push(`OBSERVABILITY FAIL: ${report.antiPatterns.length} anti-pattern(s) detected:`);
      for (const ap of report.antiPatterns) {
        const kindLabel = ap.kind === "empty_catch" ? "empty catch" : ap.kind === "swallowed_error" ? "swallowed error (no log)" : "bare static log";
        errors.push(`  ${ap.file}:${ap.line} — ${kindLabel}: ${ap.snippet}`);
      }
    }
    errors.push("", "Per-file breakdown:");
    for (const f of report.perFile) {
      const status = f.logCount >= 1 && f.errorHandlersLogged === f.errorHandlers && f.antiPatterns.length === 0 ? "✓" : "✗";
      errors.push(`  ${status} ${f.file}: ${f.logCount} logs, ${f.errorHandlers} handlers (${f.errorHandlersLogged} logged)${f.antiPatterns.length > 0 ? ` — ${f.antiPatterns.length} anti-pattern(s)` : ""}`);
    }

    return {
      ...leafBase,
      status: "fail",
      output: run.combined,
      error: errors.join("\n"),
      exit_code: run.exitCode,
      duration_ms: run.duration,
    };
  }

  // Brevity predicate
  if (node.predicate!.type === "brevity") {
    const maxAllowed = (node.predicate!.value as number) ?? 0;
    const pred = node.predicate!;

    const brevityOpts: BrevityOpts = {
      maxLineLength: pred.max_line_length ?? DEFAULT_BREVITY_OPTS.maxLineLength,
      maxFunctionLines: pred.max_function_lines ?? DEFAULT_BREVITY_OPTS.maxFunctionLines,
      maxFileLines: pred.max_file_lines ?? DEFAULT_BREVITY_OPTS.maxFileLines,
      requireCohesion: pred.require_cohesion ?? DEFAULT_BREVITY_OPTS.requireCohesion,
      minReplacementRatio: pred.min_replacement_ratio ?? DEFAULT_BREVITY_OPTS.minReplacementRatio,
    };

    // Try command tokens first, then command output (git diff --name-only etc.)
    let report = analyseBrevity(cmd, cwd, brevityOpts);
    if (!report) {
      report = analyseBrevityFromOutput(run.combined, cwd, brevityOpts);
    }

    if (!report) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: "brevity: could not identify any source files from the command or its output. Ensure the command references source files by path (e.g. `git diff --name-only HEAD~1` or `node_modules/.bin/jest src/foo.test.ts`).",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    const passed = report.totalViolations <= maxAllowed;

    const lines: string[] = [
      passed
        ? `brevity: ${report.totalViolations} violation(s) ≤ allowed ${maxAllowed}`
        : `BREVITY FAIL: ${report.totalViolations} violation(s) exceeds allowed maximum of ${maxAllowed}`,
      "",
    ];

    for (const f of report.perFile) {
      const parts: string[] = [`  ${f.file}: ${f.lineCount} lines, ${f.functionCount} functions`];
      if (f.longFunctions > 0) parts.push(`${f.longFunctions} too long`);
      if (f.mixedCohesionFunctions > 0) parts.push(`${f.mixedCohesionFunctions} mixed cohesion`);
      if (f.insertions !== undefined && f.deletions !== undefined) {
        parts.push(`+${f.insertions}/-${f.deletions}`);
      }
      lines.push(parts.join(", "));
      for (const v of f.violations) {
        lines.push(`    • L${v.line}: ${v.kind} — ${v.detail}`);
      }
    }

    if (!passed) {
      lines.push(
        "",
        "Remediation:",
        "  • Split functions >30 lines into focused single-purpose units",
        "  • Separate selection (if/switch) from iteration (for/while) — each function does one thing",
        "  • Delete old code when replacing functionality (low deletion ratio = accretion)",
        "  • Keep lines under 120 chars — break long expressions across multiple lines",
        "  • Split files >300 lines into modules",
      );
    }

    return {
      ...leafBase,
      status: passed ? "pass" : "fail",
      output: run.combined,
      error: lines.join("\n"),
      exit_code: run.exitCode,
      duration_ms: run.duration,
    };
  }

  // TDD predicate
  if (node.predicate!.type === "tdd") {
    const greenExitCode = (node.predicate!.value as number) ?? 0;
    const isGreen = run.exitCode === greenExitCode;

    if (!isGreen) {
      node.seen_failing = true;
      node.seen_failing_at = node.seen_failing_at ?? new Date().toISOString();
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: run.error,
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    if (isGreen && !node.seen_failing) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: "TDD VIOLATION: test passed without ever failing. Write a failing test first, run dod_check to record the red phase, then implement.",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    const assertionReport = analyseAssertions(cmd, cwd);
    if (assertionReport && assertionReport.total > 0 && assertionReport.nonTrivial === 0) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: [
          `TDD ASSERTION QUALITY FAIL: all ${assertionReport.total} assertion(s) in ${assertionReport.files.length} test file(s) are trivial (constant-on-constant).`,
          "The RED→GREEN cycle was observed, but these tests exercise zero production logic.",
          ...assertionReport.perFile.map((f) => `  ${f.file}: ${f.total} assertion(s), ${f.trivial} trivial`),
          "Replace trivial assertions with behavioural checks against real inputs/outputs, then re-run dod_check.",
        ].join("\n"),
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    const assertionNote = assertionReport
      ? ` | assertions: ${assertionReport.nonTrivial} non-trivial across ${assertionReport.files.length} file(s)`
      : "";

    return {
      ...leafBase,
      status: "pass",
      output: run.combined,
      error: `TDD cycle verified (seen failing → now passing)${assertionNote}`,
      exit_code: run.exitCode,
      duration_ms: run.duration,
    };
  }

  // Fallthrough: basic predicates
  const passed = evaluatePredicate(node.predicate!, run.exitCode, run.combined);
  return {
    ...leafBase,
    status: passed ? "pass" : "fail",
    output: run.combined,
    error: run.error,
    exit_code: run.exitCode,
    duration_ms: run.duration,
  };
}

// ── Carry-forward (scoped runs) ───────────────────────────────────────

/**
 * Build a LeafResult from a concrete node's persisted state, without executing.
 * Used for nodes outside the target subtree on scoped runs.
 */
function carryForwardNode(node: TaskNode, node_path: string): LeafResult {
  return {
    node_path,
    id: node.id,
    title: node.title,
    description: node.description ?? node.intent ?? node.title,
    status: node.last_status === "pending" || node.last_status === "draft" ? "skipped" : node.last_status as LeafResult["status"],
    command: node.command ?? "",
    output: node.last_output,
  };
}

/**
 * Flatten all concrete leaves, carrying forward all of them without execution.
 * Used for nodes outside the scoped subtree.
 */
function carryForwardAll(nodes: TaskNode[], parentPath?: string): LeafResult[] {
  const results: LeafResult[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      results.push(...carryForwardAll(node.children, currentPath));
    } else if (node.refinement === "concrete") {
      results.push(carryForwardNode(node, currentPath));
    }
    // Draft leaves: also carried forward
    if (node.refinement === "draft") {
      results.push({
        node_path: currentPath,
        id: node.id,
        title: node.title,
        description: node.intent ?? node.title,
        status: "draft",
        command: "",
        output: "DRAFT — refine with dod_refine before this proof can be verified.",
      });
    }
  }
  return results;
}

/**
 * Collect all leaves (concrete + draft) under a specific node path.
 * Returns {inScope, outOfScope} where inScope are the matching subtree.
 */
function partitionLeaves(
  roots: TaskNode[],
  targetPath?: string,
): { inScope: { node: TaskNode; node_path: string }[]; outOfScope: { node: TaskNode; node_path: string }[] } {
  if (!targetPath) {
    // No scoping: everything is in-scope
    const allLeaves: { node: TaskNode; node_path: string }[] = [];
    const allDrafts: { node: TaskNode; node_path: string }[] = [];
    collectAllLeaves(roots, "", allLeaves, allDrafts);
    return { inScope: allLeaves.filter(l => l.node.refinement === "concrete"), outOfScope: [] };
  }

  // Find the target node
  const target = findNodeByPath(roots, targetPath);
  if (!target) return { inScope: [], outOfScope: [] };

  // Collect leaves under target (in scope)
  const inScope: { node: TaskNode; node_path: string }[] = [];
  if (target.children) {
    flattenTargetLeaves(target.children, targetPath, inScope);
  } else if (target.refinement === "concrete") {
    inScope.push({ node: target, node_path: targetPath });
  }

  // Collect ALL leaves, then filter out those in scope
  const allLeaves = flattenConcreteLeaves(roots);
  const inScopePaths = new Set(inScope.map(l => l.node_path));
  const outOfScope = allLeaves.filter(l => !inScopePaths.has(l.node_path));

  return { inScope, outOfScope };
}

function flattenTargetLeaves(
  nodes: TaskNode[],
  parentPath: string,
  out: { node: TaskNode; node_path: string }[],
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = `${parentPath}.children.${i}`;
    if (node.children && node.children.length > 0) {
      flattenTargetLeaves(node.children, currentPath, out);
    } else if (node.refinement === "concrete") {
      out.push({ node, node_path: currentPath });
    }
  }
}

function collectAllLeaves(
  nodes: TaskNode[],
  parentPath: string,
  concrete: { node: TaskNode; node_path: string }[],
  drafts: { node: TaskNode; node_path: string }[],
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      collectAllLeaves(node.children, currentPath, concrete, drafts);
    } else if (node.refinement === "concrete") {
      concrete.push({ node, node_path: currentPath });
    } else if (node.refinement === "draft") {
      drafts.push({ node, node_path: currentPath });
    }
  }
}

// ── Main entry point ──────────────────────────────────────────────────

export async function checkDocument(
  doc: DodDocument,
  cwdOverride?: string,
  opts?: { nodePath?: string; execFn?: typeof runCommand },
): Promise<CheckResult> {
  const cwd = cwdOverride ?? doc.cwd;
  const targetPath = opts?.nodePath;

  const { inScope, outOfScope } = partitionLeaves(doc.roots, targetPath);
  const draftCount = countDraftNodes(doc.roots);

  const leafResults: LeafResult[] = [];

  // Carry forward out-of-scope leaves (scoped runs only)
  if (targetPath && outOfScope.length > 0) {
    for (const { node, node_path } of outOfScope) {
      leafResults.push(carryForwardNode(node, node_path));
    }
    // Also carry forward draft leaves
    carryForwardDrafts(doc.roots, "", targetPath, leafResults);
  }

  // Execute in-scope leaves
  let anyRealFail = false;
  let anyUnverified = false;
  let manualUnverified = 0;

  for (const { node, node_path } of inScope) {
    // Attach the path for result identification
    const result = await executeProof(node, cwd, opts?.execFn);
    result.node_path = node_path;
    leafResults.push(result);

    if (result.status === "fail" && !node.advisory) {
      anyRealFail = true;
    }
    if (result.status === "skipped" && !node.advisory) {
      anyUnverified = true;
    }
    // Count unverified manual/review proofs separately
    const isManualOrReview = node.predicate?.type === "manual" || node.predicate?.type === "review";
    if (result.status === "skipped" && isManualOrReview) {
      manualUnverified++;
    }
  }

  // If not scoped, also add draft leaf results
  if (!targetPath) {
    addDraftLeafResults(doc.roots, "", leafResults);
  }

  // Amendment cycle detection: count amendments per node, warn on >2
  const amendmentCounts = new Map<string, { title: string; count: number }>();
  for (const a of doc.amendments) {
    if (a.action === "modified" || a.action === "refined") {
      const existing = amendmentCounts.get(a.node_path);
      if (existing) {
        existing.count++;
      } else {
        // Try to find the node title
        const node = findNodeByPath(doc.roots, a.node_path);
        amendmentCounts.set(a.node_path, { title: node?.title ?? a.node_path, count: 1 });
      }
    }
  }
  const amendmentWarnings = [...amendmentCounts.entries()]
    .filter(([, v]) => v.count > 2)
    .map(([node_path, v]) => ({ node_path, title: v.title, count: v.count }));

  // Blocked by manuals: all automated proofs pass but manuals await verification
  const blockedByManuals = !targetPath && draftCount === 0 && !anyRealFail && manualUnverified > 0;

  // Scoped check suggestion: full run with many concrete leaves
  const concreteCount = inScope.length + outOfScope.length;
  const suggestScoped = !targetPath && concreteCount > 5 && draftCount > 0;

  // Proof-set fingerprint
  const proofFingerprint = computeProofFingerprint(doc.roots);

  // Tamper detection
  const tampered = !!(doc.proof_fingerprint && doc.proof_fingerprint !== proofFingerprint);

  // Overall verdict
  const overall: CheckResult["overall"] = tampered
    ? "fail"
    : targetPath
      ? "incomplete"
      : draftCount > 0
        ? "incomplete"
        : anyRealFail
          ? "fail"
          : anyUnverified
            ? "incomplete"
            : "pass";

  const concreteTotal = leafResults.filter(r => r.status !== "draft").length;
  const passCount = leafResults.filter(r => r.status === "pass").length;

  const baseSummary = targetPath
    ? `SCOPED (node "${targetPath}"): run a full dod_check (no nodePath) to verify completion`
    : `${passCount}/${concreteTotal} concrete proofs pass${draftCount > 0 ? `, ${draftCount} draft node(s) not verified` : ""}`;

  // Build guidance lines
  const guidance: string[] = [];

  if (blockedByManuals) {
    guidance.push(`⛔ ${manualUnverified} manual/review proof(s) await dod_verify — DoD CANNOT pass without human verification.`);
  } else if (!targetPath && manualUnverified > 0) {
    guidance.push(`${manualUnverified} manual/review proof(s) await dod_verify.`);
  }

  if (amendmentWarnings.length > 0) {
    const names = amendmentWarnings.map(w => `"${w.title}" (${w.count} amendments)`).join(", ");
    guidance.push(`⚠️ Excessive amendment cycles: ${names} — are proofs being tuned rather than code being fixed?`);
  }

  if (suggestScoped) {
    guidance.push(`💡 ${concreteCount} concrete proofs — use dod_check(nodePath="0") to verify one subtree at a time (faster iteration).`);
  }

  if (!targetPath && draftCount > 0 && !suggestScoped) {
    guidance.push(`${draftCount} draft node(s) — refine incrementally per task group with dod_refine, not all at once at the end.`);
  }

  const summary = tampered
    ? `TAMPER DETECTED — proof-set fingerprint mismatch (store edited outside dod_amend). Verdict forced to FAIL. ${baseSummary}`
    : guidance.length > 0
      ? [baseSummary, "", ...guidance].join("\n")
      : baseSummary;

  return {
    overall,
    leaves: leafResults,
    summary,
    timestamp: new Date().toISOString(),
    proof_fingerprint: proofFingerprint,
    draft_count: draftCount,
    manual_unverified: manualUnverified,
    amendment_warnings: amendmentWarnings,
    blocked_by_manuals: blockedByManuals,
    ...(targetPath ? { scoped: true, ran_node_path: targetPath } : {}),
    ...(tampered ? { tampered: true } : {}),
  };
}

/** Helper: add draft LeafResults for all draft nodes in the tree. */
function addDraftLeafResults(nodes: TaskNode[], parentPath: string, out: LeafResult[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      addDraftLeafResults(node.children, currentPath, out);
    } else if (node.refinement === "draft") {
      out.push({
        node_path: currentPath,
        id: node.id,
        title: node.title,
        description: node.intent ?? node.title,
        status: "draft",
        command: "",
        output: "DRAFT — refine with dod_refine before this proof can be verified.",
      });
    }
  }
}

/** Helper: carry forward draft leaves for scoped runs. */
function carryForwardDrafts(nodes: TaskNode[], parentPath: string, targetPath: string, out: LeafResult[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const currentPath = parentPath ? `${parentPath}.children.${i}` : `${i}`;
    if (node.children && node.children.length > 0) {
      // Only descend into children if targetPath starts with this prefix
      if (targetPath.startsWith(currentPath)) continue; // in scope, handled by execute
      carryForwardDrafts(node.children, currentPath, targetPath, out);
    } else if (node.refinement === "draft" && !targetPath.startsWith(currentPath)) {
      out.push({
        node_path: currentPath,
        id: node.id,
        title: node.title,
        description: node.intent ?? node.title,
        status: "draft",
        command: "",
        output: "DRAFT — refine with dod_refine before this proof can be verified.",
      });
    }
  }
}
