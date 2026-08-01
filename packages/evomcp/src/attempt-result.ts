import type { SolvePlan } from "./solve-plan.js";
import type { VerifyOutcome } from "./solve-verify.js";
import type { LineageDiagnostic } from "./types.js";

/**
 * Everything one solve attempt produced. Never crosses the tool boundary.
 */
export interface AttemptResult {
  /** Per-attempt record that reaches the escalation report. */
  diagnostic: LineageDiagnostic;
  /** Git branch this attempt worked on. */
  branch: string;
  /** Diff of the branch against the default branch. */
  diff: string;
  /** True when the last verification exited 0. */
  passed: boolean;
  /** Report of the last verification. */
  report: string;
  /** Raw output of the last verification, used for repair feedback. */
  output: string;
  /** Exit code of the last verification, or -1 when none ran. */
  exitCode: number;
}

/** Characters of verification output kept on the diagnostic. */
const SAMPLE_CHARS = 300;

/** Start a fresh attempt record for a plan. */
export function blankResult(plan: SolvePlan): AttemptResult {
  return {
    diagnostic: {
      lineage_id: `strategy-${plan.index}`,
      strategy: plan.label,
      timed_out: false,
      claude_exit_code: 0,
      claude_no_output: false,
      claude_output_sample: "",
      repair_attempts: 0,
      final_status: "failed",
    },
    branch: `solve-strategy-${plan.index}`,
    diff: "",
    passed: false,
    report: "",
    output: "",
    exitCode: -1,
  };
}

/**
 * Record that the attempt never got a branch. No worker ran, so the exit
 * code is the "did not run" sentinel and the status is a plain failure.
 */
export function markSpawnFailed(state: AttemptResult): AttemptResult {
  state.diagnostic.claude_exit_code = -1;
  state.diagnostic.claude_no_output = true;
  state.diagnostic.final_status = "failed";
  return state;
}

/** Record that the attempt produced nothing usable. */
export function markNoOutput(state: AttemptResult): AttemptResult {
  state.diagnostic.claude_no_output = true;
  state.diagnostic.final_status = "no_output";
  return state;
}

/**
 * Fold a verification outcome into the attempt state and its diagnostic.
 * This is the only place that writes the verify fields.
 */
export function applyVerification(state: AttemptResult, outcome: VerifyOutcome): void {
  state.passed = outcome.passed;
  state.exitCode = outcome.exitCode;
  state.output = outcome.output;
  state.report = outcome.report;

  const diagnostic = state.diagnostic;
  diagnostic.verify_failed = !outcome.passed;
  diagnostic.verify_exit_code = outcome.exitCode;
  diagnostic.verify_output_sample = outcome.output.slice(0, SAMPLE_CHARS);
}
