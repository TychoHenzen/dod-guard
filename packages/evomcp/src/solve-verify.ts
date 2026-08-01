/**
 * Verification for one solve candidate.
 *
 * When the caller supplied a build, test or lint command, the gate pipeline
 * decides. Otherwise the verify command runs on its own. Either way the
 * answer is one exit code plus the diagnostic text of whatever failed.
 */

import { runCommand, toVerdict } from "./agent.js";
import { GateRunner } from "./gates.js";
import type { GateResult, TaskSpec } from "./types.js";

export interface VerifyOutcome {
  /** True when every configured check exited 0. */
  passed: boolean;
  /** Exit code of the first failing check, or 0. */
  exitCode: number;
  /** Diagnostic text of the failing check, for feedback compilation. */
  output: string;
  /** Human-readable report of what ran, with the full failure text. */
  report: string;
}

function formatGate(result: GateResult): string {
  const label = result.passed ? "PASSED" : "FAILED";
  return `- ${result.gate}: ${label} (${result.elapsed_ms}ms)`;
}

/**
 * Diagnostics of every failing gate, each under its own header. The header
 * is part of the text the failure hash covers, so it must not change.
 */
function formatFailures(results: GateResult[]): string {
  return results
    .filter((r) => !r.passed)
    .map((r) => `=== FAILED: ${r.gate} ===\n${r.diagnostics}`)
    .join("\n\n");
}

async function runGateVerification(spec: TaskSpec): Promise<VerifyOutcome> {
  const runner = new GateRunner({
    build_cmd: spec.build_cmd,
    test_cmd: spec.test_cmd,
    lint_cmd: spec.lint_cmd,
    verify_cmd: spec.verify_cmd,
  });
  const results = await runner.runAll(spec.cwd);
  const report = results.map(formatGate).join("\n");
  const output = formatFailures(results);

  if (!output) return { passed: true, exitCode: 0, output: "", report };
  const full = `${report}\n\n${output}`;
  return { passed: false, exitCode: 1, output, report: full };
}

/**
 * Verify the current working tree against the caller checks.
 */
export async function runVerification(spec: TaskSpec): Promise<VerifyOutcome> {
  const gated = spec.build_cmd || spec.test_cmd || spec.lint_cmd;
  if (gated) return runGateVerification(spec);

  const verdict = toVerdict(runCommand(spec.verify_cmd, spec.cwd));
  const label = verdict.passed ? "PASSED" : "FAILED";
  const head = `- verify: ${label} (exit=${verdict.exit_code})`;
  return {
    passed: verdict.passed,
    exitCode: verdict.exit_code,
    output: verdict.output,
    report: `${head}\n\n${verdict.output}`,
  };
}
