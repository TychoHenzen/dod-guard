console.debug("evaluate-proof: module loaded", { pid: process.pid });

import type { TaskNode, LeafResult, Predicate } from "./types.js";
import { perProofFingerprint } from "./manual.js";
import { extractNumber } from "./regression.js";
import { analyseAssertions } from "./assertions.js";
import {
  analyseObservability,
  analyseObservabilityFromOutput,
} from "./observability.js";
import {
  analyseBrevity,
  analyseBrevityFromOutput,
  DEFAULT_BREVITY_OPTS,
  type BrevityOpts,
} from "./brevity.js";

// ── Mutation output parsing ───────────────────────────────────────────────

function parseStryker(output: string): number | null {
  const lines = output.split(/\r?\n/);
  const headerIdx = lines.findIndex(
    (l) => l.includes("|") && /#\s*survived/i.test(l),
  );
  if (headerIdx === -1) return null;
  const headerCells = lines[headerIdx]
    .split("|")
    .map((c) => c.trim().toLowerCase());
  const col = headerCells.findIndex((c) => /survived/.test(c));
  if (col === -1) return null;
  const dataLine = lines.find(
    (l) => l.includes("|") && l.trim().toLowerCase().startsWith("all files"),
  );
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

/** Extract the surviving-mutant count from a mutation tool's combined output. */
export function parseSurvivors(output: string): number | null {
  for (const parser of [parseStryker, parseMutmut, parseCargoMutants]) {
    const survivors = parser(output);
    if (survivors !== null) return survivors;
  }
  return null;
}

export type RunResult = {
  exitCode: number;
  combined: string;
  duration: number;
  error?: string;
  killed?: boolean;
  notFound?: boolean;
};

export type ExecFn = (cmd: string, cwd: string) => Promise<RunResult>;

export async function executeProof(
  node: TaskNode,
  cwd: string,
  execFn: ExecFn,
): Promise<LeafResult> {
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
      const statusMarker = mr.answer === "fail" ? `✗` : `✓`;
      const noteStr = mr.note ? ` — "${mr.note}"` : "";
      const output = `${statusMarker} ${label} ${mr.answer.toUpperCase()} (via dod_verify) at ${mr.confirmed_at} via ${mr.channel}${noteStr}`;
      return {
        ...leafBase,
        status: mr.answer,
        output,
        error:
          mr.answer === "fail"
            ? `${label} was confirmed as failing by the human.`
            : undefined,
      };
    }

    return {
      ...leafBase,
      status: "skipped",
      output: `${label} not yet verified — call dod_verify(dod_id, "${node.id}") to request human confirmation.`,
    };
  }

  const run = await execFn(cmd, cwd);

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
        error:
          "could not parse mutation results (no recognized Stryker/mutmut/cargo-mutants summary)",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }
    const passed = survivors <= maxAllowed;
    return {
      ...leafBase,
      status: passed ? "pass" : "fail",
      output: run.combined,
      error: passed
        ? undefined
        : `mutation: ${survivors} surviving mutant(s) exceeds the allowed maximum of ${maxAllowed}`,
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
        error:
          "regression: could not parse a metric number from output (fail-safe — never auto-passes)",
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
    const threshold = lowerIsBetter
      ? baseline * (1 + tol)
      : baseline * (1 - tol);
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
        ? undefined
        : `streamline: ${matchCount} leftover reference(s) exceed max allowed (${maxAllowed})`,
      exit_code: run.exitCode,
      duration_ms: run.duration,
    };
  }

  // Assertions predicate
  if (node.predicate!.type === "assertions") {
    const minAssertions = (node.predicate!.value as number) ?? 1;

    const report = analyseAssertions(cmd, cwd);
    if (!report) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error:
          "assertions: could not identify any test files from the command. Ensure the command references test files by path (e.g. `pytest tests/test_foo.py`).",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    const nonTrivial = report.nonTrivial;
    if (nonTrivial < minAssertions) {
      const perFileDetail = report.perFile
        .map(
          (f) =>
            `  ${f.file}: ${f.total} total, ${f.trivial} trivial, ${f.total - f.trivial} non-trivial`,
        )
        .join("\n");
      const isAllTrivial = report.nonTrivial === 0;
      const header = isAllTrivial
        ? `ASSERTION QUALITY FAIL: all ${report.total} assertions are trivial (constant-on-constant) — zero production logic exercised`
        : `ASSERTION QUALITY FAIL: only ${nonTrivial} non-trivial assertion(s), need at least ${minAssertions}`;
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error: [
          header,
          `Total: ${report.total} assertions, ${report.trivial} trivial, across ${report.files.length} test file(s)`,
          "",
          "Per-file breakdown:",
          perFileDetail,
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
        error:
          "observability: could not identify any source files from the command or its output. Ensure the command references source files by path.",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    const tooFewLogs = report.totalLogStatements < minLogStatements;
    const unloggedErrors =
      report.totalErrorHandlers - report.errorHandlersLogged;
    const hasAntiPatterns = report.antiPatterns.length > 0;

    if (!tooFewLogs && unloggedErrors === 0 && !hasAntiPatterns) {
      return {
        ...leafBase,
        status: "pass",
        output: run.combined,
        error: `observability: ${report.totalLogStatements} log statement(s), ${report.totalErrorHandlers} error handler(s) all logged, no anti-patterns`,
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    const lines: string[] = [];
    if (tooFewLogs)
      lines.push(
        `observability: only ${report.totalLogStatements} log statement(s) — need at least ${minLogStatements}`,
      );
    if (unloggedErrors > 0)
      lines.push(
        `observability: ${unloggedErrors} of ${report.totalErrorHandlers} error handler(s) do not log`,
      );
    if (hasAntiPatterns)
      lines.push(
        `observability: ${report.antiPatterns.length} anti-pattern(s)` +
          report.antiPatterns.map((a) => `  ${a.file}:${a.line}: ${a.kind} — ${a.snippet}`).join(""),
      );

    return {
      ...leafBase,
      status: "fail",
      output: run.combined,
      error: lines.join("\n"),
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
      maxFunctionLines:
        pred.max_function_lines ?? DEFAULT_BREVITY_OPTS.maxFunctionLines,
      maxFileLines: pred.max_file_lines ?? DEFAULT_BREVITY_OPTS.maxFileLines,
      requireCohesion:
        pred.require_cohesion ?? DEFAULT_BREVITY_OPTS.requireCohesion,
      minReplacementRatio:
        pred.min_replacement_ratio ?? DEFAULT_BREVITY_OPTS.minReplacementRatio,
    };

    let report = analyseBrevity(cmd, cwd, brevityOpts);
    if (!report) {
      report = analyseBrevityFromOutput(run.combined, cwd, brevityOpts);
    }

    if (!report) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error:
          "brevity: could not identify any source files from the command or its output. Ensure the command references source files by path.",
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
      const parts: string[] = [
        `  ${f.file}: ${f.lineCount} lines, ${f.functionCount} functions`,
      ];
      if (f.longFunctions > 0) parts.push(`${f.longFunctions} too long`);
      if (f.mixedCohesionFunctions > 0)
        parts.push(`${f.mixedCohesionFunctions} mixed cohesion`);
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
    const expectedExit = (node.predicate!.value as number) ?? 0;
    const isGreen = run.exitCode === expectedExit;

    if (isGreen && !node.seen_failing) {
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error:
          "TDD VIOLATION: GREEN without prior RED. The test passed immediately — it never failed first, so it may be a tautology (e.g. expect(true).toBe(true)). Make the test fail first (RED), then implement the fix (GREEN).",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    if (!isGreen && !node.seen_failing) {
      node.seen_failing = true;
      node.seen_failing_at = new Date().toISOString();
      return {
        ...leafBase,
        status: "fail",
        output: run.combined,
        error:
          "TDD RED: test is failing as expected. This is the RED phase — now implement the fix so it passes. (seen_failing recorded)",
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    if (isGreen && node.seen_failing) {
      // Check assertion quality on GREEN
      const assertionReport = analyseAssertions(cmd, cwd);
      if (assertionReport && assertionReport.nonTrivial === 0) {
        return {
          ...leafBase,
          status: "fail",
          output: run.combined,
          error:
            "TDD ASSERTION QUALITY FAIL: GREEN but all assertions are trivial (constant-on-constant). The test passes without exercising real logic. Ensure the test has non-trivial assertions against computed values.",
          exit_code: run.exitCode,
          duration_ms: run.duration,
        };
      }
      return {
        ...leafBase,
        status: "pass",
        output: run.combined,
        error: `TDD cycle verified (green after red)${assertionReport ? ` — ${assertionReport.nonTrivial} non-trivial assertion(s)` : ""}`,
        exit_code: run.exitCode,
        duration_ms: run.duration,
      };
    }

    return {
      ...leafBase,
      status: "fail",
      output: run.combined,
      error: `TDD: test failed (exit ${run.exitCode}, expected ${expectedExit})`,
      exit_code: run.exitCode,
      duration_ms: run.duration,
    };
  }

  // Basic predicates (exit_code, output_contains, etc.)
  const passed = evaluatePredicate(
    node.predicate!,
    run.exitCode,
    run.combined,
  );

  return {
    ...leafBase,
    status: passed ? "pass" : "fail",
    output: run.combined,
    error: passed
      ? undefined
      : `predicate ${node.predicate!.type} failed: exit ${run.exitCode}, expected ${JSON.stringify(node.predicate!.value)}`,
    exit_code: run.exitCode,
    duration_ms: run.duration,
  };
}

// ── Basic predicate evaluation ────────────────────────────────────────────

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
