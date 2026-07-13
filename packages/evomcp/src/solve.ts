/**
 * Best-of-N solver with repair chains and cascade escalation.
 *
 * Uses `claude -p` subprocesses pointed at the deepclaude proxy so DeepSeek
 * gets full Claude Code tool access (files, shell, MCPs). evomcp orchestrates:
 *
 * Pipeline:
 *  1. Spawn N `claude -p` instances in parallel, each with different strategy prompt
 *  2. After each completes, run verify_cmd
 *  3. If pass → return winner + verification report
 *  4. If fail → spawn repair `claude -p` with failure feedback (up to 3×)
 *  5. Stuck detection: same failure signature after repair → kill lineage
 *  6. All lineages exhausted → escalate to parent Claude with failure report
 */

import { execSync } from "node:child_process";
import {
  ensureProxy,
  getProxyCost,
  hashFailure,
  repairPrompt,
  runCommand,
  spawnClaude,
  spawnClaudeN,
  strategyPrompts,
  toVerdict,
} from "./agent.js";
import type { Candidate, EscalationReport, LineageDiagnostic, RunStats, SolveResult, TaskSpec } from "./types.js";

const MAX_REPAIRS = 3;
const DEFAULT_N = 5;
const DEFAULT_TIMEOUT_MS = 300_000; // 5 min per claude -p instance
const REPAIR_TIMEOUT_MS = 180_000; // 3 min for repairs

/** Capture git diff for the working tree — what claude -p actually changed. */
function captureDiff(cwd: string): string | null {
  try {
    const diff = execSync("git diff HEAD", { cwd, encoding: "utf-8", timeout: 10_000 });
    return diff || null;
  } catch {
    return null;
  }
}

export async function solve(spec: TaskSpec, onProgress?: (msg: string) => void): Promise<SolveResult> {
  const startTime = Date.now();
  const stats: RunStats = {
    plans_sampled: 0,
    plans_deduped: 0,
    candidates_generated: 0,
    tokens_consumed: -1,
    duration_ms: 0,
    model: spec.model ?? "deepseek-v4-pro[1m]",
  };

  // Ensure proxy is running
  const proxyReady = await ensureProxy();
  if (!proxyReady) {
    onProgress?.("WARNING: deepclaude proxy not running. Attempting direct mode with DEEPSEEK_API_KEY...");
  }

  const numParallel = spec.fanout ?? DEFAULT_N;

  // Snapshot proxy cost before spawning subprocesses
  const costBefore = proxyReady ? await getProxyCost() : null;

  stats.plans_sampled = numParallel;
  stats.plans_deduped = numParallel;

  // ── Phase 1: Generate diverse strategies ────────────────────────────

  const strategies = strategyPrompts(spec.goal, numParallel, spec.context);
  onProgress?.(`Spawning ${numParallel} parallel claude -p instances with diverse strategies...`);

  const results = await spawnClaudeN(strategies, {
    cwd: spec.cwd,
    model: spec.model,
    apiKey: spec.api_key,
    useProxy: proxyReady,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  onProgress?.(`All ${numParallel} instances completed. Verifying...`);

  // ── Phase 2: Verify each candidate ──────────────────────────────────

  const candidates: Candidate[] = [];
  const failureSignatures = new Set<string>();
  const diagnostics: LineageDiagnostic[] = [];

  const STRATEGY_LABELS = [
    "simplest",
    "robust",
    "performant",
    "modular",
    "defensive",
    "functional",
    "pragmatic",
    "elegant",
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const stratLabel = STRATEGY_LABELS[i % STRATEGY_LABELS.length];
    const hasOutput = r.output.trim().length > 0;

    if (r.timedOut) {
      onProgress?.(`  [${i + 1}] timed out — skipping`);
      diagnostics.push({
        lineage_id: `strategy-${i}`,
        strategy: stratLabel,
        timed_out: true,
        claude_exit_code: r.exitCode,
        claude_no_output: !hasOutput,
        claude_output_sample: r.output.slice(0, 500),
        repair_attempts: 0,
        final_status: "timed_out",
      });
      continue;
    }

    if (!hasOutput) {
      onProgress?.(`  [${i + 1}] no output from claude -p (exit ${r.exitCode}) — skipping`);
      diagnostics.push({
        lineage_id: `strategy-${i}`,
        strategy: stratLabel,
        timed_out: false,
        claude_exit_code: r.exitCode,
        claude_no_output: true,
        claude_output_sample: "",
        repair_attempts: 0,
        final_status: "no_output",
      });
      continue;
    }

    const candidate: Candidate = {
      plan_id: `strategy-${i}`,
      patch: `claude -p output (${r.exitCode}):\n${r.output.slice(0, 500)}`,
      repair_count: 0,
      status: "verifying",
    };
    candidates.push(candidate);
    stats.candidates_generated++;

    // Run verification
    const rawVerdict = runCommand(spec.verify_cmd, spec.cwd);
    const verdict = toVerdict(rawVerdict);
    candidate.verdict = verdict;

    if (verdict.exit_code === 0) {
      candidate.status = "passed";
      onProgress?.(`  [${i + 1}] PASSED in ${r.durationMs}ms!`);

      stats.duration_ms = Date.now() - startTime;
      if (costBefore) {
        const costAfter = await getProxyCost();
        if (costAfter) stats.tokens_consumed = costAfter.total_tokens - costBefore.total_tokens;
      }
      return {
        outcome: "pass",
        patch: captureDiff(spec.cwd) ?? `claude -p output (${r.exitCode}):\n${r.output.slice(0, 500)}`,
        verification_report: verdict.output,
        stats,
      };
    }

    candidate.status = "failed";
    candidate.failure_signature = hashFailure(verdict.output);
    failureSignatures.add(candidate.failure_signature);
    onProgress?.(`  [${i + 1}] failed (exit ${verdict.exit_code}): ${verdict.output.slice(0, 120)}`);

    // Track initial diagnostic for this lineage
    diagnostics.push({
      lineage_id: `strategy-${i}`,
      strategy: stratLabel,
      timed_out: false,
      claude_exit_code: r.exitCode,
      claude_no_output: false,
      claude_output_sample: r.output.slice(0, 500),
      verify_failed: true,
      verify_exit_code: verdict.exit_code,
      verify_output_sample: verdict.output.slice(0, 300),
      repair_attempts: 0,
      final_status: "failed",
    });
  }

  // ── Phase 3: Repair loop ────────────────────────────────────────────

  // Pick top N/2 candidates for repair (best exit codes, most output = most progress)
  const repairable = candidates
    .filter((c) => c.status === "failed" && c.verdict)
    .sort((a, b) => {
      const aCode = a.verdict?.exit_code ?? 1;
      const bCode = b.verdict?.exit_code ?? 1;
      if (aCode !== bCode) return aCode - bCode;
      return (b.verdict?.output?.length ?? 0) - (a.verdict?.output?.length ?? 0);
    })
    .slice(0, Math.max(2, Math.ceil(numParallel / 2)));

  for (const candidate of repairable) {
    for (let repair = 1; repair <= MAX_REPAIRS; repair++) {
      onProgress?.(`  Repair attempt ${repair}/${MAX_REPAIRS} for ${candidate.plan_id}...`);

      // Update diagnostic for this lineage
      const diag = diagnostics.find((d) => d.lineage_id === candidate.plan_id);
      if (diag) diag.repair_attempts = repair;

      const prompt = repairPrompt(spec.goal, candidate.verdict?.output ?? "", repair, spec.context);

      const result = await spawnClaude(prompt, {
        cwd: spec.cwd,
        model: spec.model,
        apiKey: spec.api_key,
        useProxy: proxyReady,
        timeoutMs: REPAIR_TIMEOUT_MS,
      });

      if (result.timedOut) {
        onProgress?.(`    → timed out`);
        if (diag) diag.final_status = "timed_out";
        break;
      }

      stats.candidates_generated++;

      const rawRepairVerdict = runCommand(spec.verify_cmd, spec.cwd);
      const repairVerdict = toVerdict(rawRepairVerdict);
      candidate.verdict = repairVerdict;
      candidate.repair_count = repair;
      candidate.patch = `repair #${repair} output (${result.exitCode}):\n${result.output.slice(0, 500)}`;

      if (repairVerdict.exit_code === 0) {
        candidate.status = "passed";
        if (diag) {
          diag.final_status = "passed";
          diag.verify_exit_code = 0;
          diag.verify_output_sample = repairVerdict.output.slice(0, 300);
        }
        onProgress?.(`  → REPAIR ${repair} PASSED!`);

        stats.duration_ms = Date.now() - startTime;
        if (costBefore) {
          const costAfter = await getProxyCost();
          if (costAfter) stats.tokens_consumed = costAfter.total_tokens - costBefore.total_tokens;
        }
        return {
          outcome: "pass",
          patch:
            captureDiff(spec.cwd) ?? `repair #${repair} output (${result.exitCode}):\n${result.output.slice(0, 500)}`,
          verification_report: repairVerdict.output,
          stats,
        };
      }

      const sig = hashFailure(repairVerdict.output);

      // Stuck detection: same failure after repair
      if (candidate.failure_signature && sig === candidate.failure_signature) {
        onProgress?.(`    → stuck (same failure after repair ${repair})`);
        if (diag) {
          diag.final_status = "stuck";
          diag.verify_exit_code = repairVerdict.exit_code;
          diag.verify_output_sample = repairVerdict.output.slice(0, 300);
        }
        break;
      }

      candidate.failure_signature = sig;
      failureSignatures.add(sig);
      onProgress?.(`    → still failing: ${repairVerdict.output.slice(0, 100)}`);
    }
  }

  // ── Phase 4: Escalation ─────────────────────────────────────────────

  // Find common failure signature
  const sigCounts = new Map<string, number>();
  for (const c of candidates) {
    if (c.failure_signature) {
      sigCounts.set(c.failure_signature, (sigCounts.get(c.failure_signature) ?? 0) + 1);
    }
  }
  const dominantSig = [...sigCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  // Best partial attempt
  const bestCandidate = candidates
    .filter((c) => c.verdict)
    .sort((a, b) => (a.verdict?.exit_code ?? 1) - (b.verdict?.exit_code ?? 1))[0];

  const escalation: EscalationReport = {
    failure_signature: dominantSig?.[0] ?? "unknown",
    best_partial_patch: bestCandidate?.patch,
    best_output: bestCandidate?.verdict?.output?.slice(0, 2000),
    lineages_attempted: numParallel,
    lineage_diagnostics: diagnostics,
    summary: [
      `${numParallel} strategies attempted, ${stats.candidates_generated} candidates generated.`,
      `Best exit code: ${bestCandidate?.verdict?.exit_code ?? "N/A"}`,
      dominantSig ? `${dominantSig[1]} lineages hit same failure pattern.` : "No common failure pattern.",
      "Escalate to Claude: solve the specific failing assertion directly.",
    ].join(" "),
  };

  stats.duration_ms = Date.now() - startTime;
  if (costBefore) {
    const costAfter = await getProxyCost();
    if (costAfter) stats.tokens_consumed = costAfter.total_tokens - costBefore.total_tokens;
  }
  onProgress?.(`Escalating: ${escalation.summary}`);

  return {
    outcome: "escalate",
    escalation,
    stats,
  };
}
