/**
 * Orchestrated solve flow — drives the orchestrator state machine through
 * SPEC -> TEST_AUTHOR -> IMPLEMENT -> HARDEN -> REVIEW -> MERGE stages.
 *
 * The orchestrator enforces transitions and gates (orchestrator.ts).
 * This module provides the stage bodies that do the actual work.
 */

import {
  type OrchestratorState,
  type PlaybookStage,
  advanceStage,
  buildTriggerSignals,
  completeStage,
  createOrchestrator,
  failStage,
  orchestratorSummary,
  shouldContinue,
  STAGE_LABELS,
} from "./orchestrator.js";
import { solve } from "./solve.js";
import type { SolveResult, TaskSpec } from "./types.js";
import { runCommand } from "./agent.js";

// ── Types ──────────────────────────────────────────────────────────────

export type PlaybookType = "bugfix" | "feature" | "refactor" | "test-harden" | "reconcile" | "review";

/** Extends TaskSpec with orchestration-specific fields. */
export interface OrchestrateSpec extends TaskSpec {
  playbook: PlaybookType;
  mutation_cmd?: string;
}

export interface StageResult {
  stage: string;
  status: "passed" | "failed" | "skipped" | "human_gate";
  message?: string;
  tokens?: number;
  ms?: number;
}

export interface OrchestrateResult {
  outcome: "pass" | "escalate" | "incomplete";
  summary: string;
  solveResult?: SolveResult;
  stages: StageResult[];
}

// ── Orchestrated flow ─────────────────────────────────────────────────

/**
 * Drive the orchestrator through all stages, calling solve() for IMPLEMENT
 * and running human-gate or automated bodies for other stages.
 */
export async function orchestrateSolve(
  spec: OrchestrateSpec,
  onProgress?: (msg: string) => void,
): Promise<OrchestrateResult> {
  const state: OrchestratorState = createOrchestrator();
  const stages: StageResult[] = [];
  const startTime = Date.now();

  while (shouldContinue(state)) {
    const adv = advanceStage(state);
    if (!adv.stage) {
      if (!state.completed) {
        stages.push({
          stage: adv.gate.stage,
          status: "failed",
          message: adv.gate.enterBlockReason ?? "Blocked by gate",
        });
      }
      break;
    }

    const currentStage: PlaybookStage = adv.stage;
    const label = STAGE_LABELS[currentStage];
    onProgress?.(`\n=== Stage: ${label} ===`);
    onProgress?.(orchestratorSummary(state));

    const stageStart = Date.now();
    let stageTokens = 0;

    switch (currentStage) {
      // ── SPEC: human gate ───────────────────────────────────────────
      case "spec": {
        onProgress?.(`Goal: ${spec.goal}`);
        onProgress?.(
          `[HUMAN GATE] Please confirm the requirements above are correct. ` +
            `Use \`dod_verify\` or acknowledge manually.`,
        );
        completeStage(state, "spec", 0, Date.now() - stageStart);
        stages.push({
          stage: "spec",
          status: "human_gate",
          message: "Spec provided via tool input — verify manually if needed",
          ms: Date.now() - stageStart,
        });
        break;
      }

      // ── TEST_AUTHOR: human gate ────────────────────────────────────
      case "test_author": {
        onProgress?.(
          `[HUMAN GATE] Tests must exist and be RED before implementation begins. ` +
            `Run your test suite and confirm it fails. Use \`dod_verify\` or acknowledge manually.`,
        );
        completeStage(state, "test_author", 0, Date.now() - stageStart);
        stages.push({
          stage: "test_author",
          status: "human_gate",
          message: "Gate auto-passed — verify tests are red before running orchestrate",
          ms: Date.now() - stageStart,
        });
        break;
      }

      // ── IMPLEMENT: call solve() ───────────────────────────────────
      case "implement": {
        onProgress?.("Running implementation stage (solve)...");
        const solveResult: SolveResult = await solve(spec, (msg: string) =>
          onProgress?.(`  [solve] ${msg}`),
        );
        state.solveResult = solveResult;
        stageTokens = solveResult.stats.tokens_consumed > 0 ? solveResult.stats.tokens_consumed : 0;

        if (solveResult.outcome === "pass") {
          completeStage(state, "implement", stageTokens, solveResult.stats.duration_ms);
          stages.push({
            stage: "implement",
            status: "passed",
            message: "Solve passed",
            tokens: stageTokens,
            ms: solveResult.stats.duration_ms,
          });
        } else {
          // Solve escalated internally (all lineages exhausted) — treat as
          // terminal failure at the orchestrator level. There is no retry
          // mechanism for the IMPLEMENT stage within orchestrate.
          const signals = buildTriggerSignals(false, false, false, state.budget.exhausted, false);
          failStage(state, "implement", stageTokens, solveResult.stats.duration_ms, signals);
          // Ensure abort regardless of escalation rung state (solve exhausted
          // its own internal escalation already)
          if (!state.aborted) {
            state.aborted = true;
            state.abortReason = solveResult.escalation?.summary ?? "Solve escalation — all lineages exhausted";
          }
          stages.push({
            stage: "implement",
            status: "failed",
            message: solveResult.escalation?.summary ?? "Solve escalation",
            tokens: stageTokens,
            ms: solveResult.stats.duration_ms,
          });
        }
        break;
      }

      // ── HARDEN: mutation_cmd or human gate ────────────────────────
      case "harden": {
        if (spec.mutation_cmd) {
          onProgress?.(`Running mutation testing: ${spec.mutation_cmd}`);
          const result = runCommand(spec.mutation_cmd, spec.cwd, 600_000);
          if (result.exitCode === 0) {
            completeStage(state, "harden", 0, Date.now() - stageStart);
            stages.push({
              stage: "harden",
              status: "passed",
              message: "Mutation testing passed",
              ms: Date.now() - stageStart,
            });
          } else {
            stages.push({
              stage: "harden",
              status: "failed",
              message: `Mutation testing failed (exit ${result.exitCode})`,
              ms: Date.now() - stageStart,
            });
          }
        } else {
          onProgress?.(
            `[HUMAN GATE] No mutation_cmd provided. ` +
              `Verify test hardening is adequate before proceeding. ` +
              `Use \`dod_verify\` or acknowledge manually.`,
          );
          completeStage(state, "harden", 0, Date.now() - stageStart);
          stages.push({
            stage: "harden",
            status: "human_gate",
            message: "No mutation_cmd — verify test hardening manually",
            ms: Date.now() - stageStart,
          });
        }
        break;
      }

      // ── REVIEW: human gate ────────────────────────────────────────
      case "review": {
        onProgress?.(
          `[HUMAN GATE] Please review the patch for correctness and quality. ` +
            `Use \`dod_verify\` or acknowledge manually to approve.`,
        );
        completeStage(state, "review", 0, Date.now() - stageStart);
        stages.push({
          stage: "review",
          status: "human_gate",
          message: "Gate auto-passed — please review the patch manually",
          ms: Date.now() - stageStart,
        });
        break;
      }

      // ── MERGE: held-out tests + adopt ──────────────────────────────
      case "merge": {
        if (spec.held_out_tests) {
          onProgress?.(`Running held-out tests: ${spec.held_out_tests}`);
          const result = runCommand(spec.held_out_tests, spec.cwd);
          if (result.exitCode === 0) {
            completeStage(state, "merge", 0, Date.now() - stageStart);
            stages.push({
              stage: "merge",
              status: "passed",
              message: "Held-out tests passed",
              ms: Date.now() - stageStart,
            });
          } else {
            state.aborted = true;
            state.abortReason = `Held-out tests failed (exit ${result.exitCode})`;
            stages.push({
              stage: "merge",
              status: "failed",
              message: `Held-out tests failed (exit ${result.exitCode}): ${result.output.slice(0, 200)}`,
              ms: Date.now() - stageStart,
            });
          }
        } else {
          completeStage(state, "merge", 0, Date.now() - stageStart);
          stages.push({
            stage: "merge",
            status: "passed",
            message: "Merge completed (no held-out tests)",
            ms: Date.now() - stageStart,
          });
        }
        break;
      }
    }
  }

  const totalMs = Date.now() - startTime;

  return {
    outcome: state.completed ? "pass" : state.aborted ? "escalate" : "incomplete",
    summary: [
      orchestratorSummary(state),
      "",
      `Total time: ${(totalMs / 1000).toFixed(1)}s`,
      "",
      "### Stage Results",
      ...stages.map((s: StageResult) => {
        const icon =
          s.status === "passed" ? "PASS" : s.status === "failed" ? "FAIL" : s.status === "human_gate" ? "GATE" : "SKIP";
        let line = `${icon}  ${s.stage}: ${s.status}`;
        if (s.message) line += ` - ${s.message}`;
        if (s.tokens) line += ` (${s.tokens} tokens)`;
        if (s.ms) line += ` (${(s.ms / 1000).toFixed(1)}s)`;
        return line;
      }),
    ].join("\n"),
    solveResult: state.solveResult,
    stages,
  };
}
