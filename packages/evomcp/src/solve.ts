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
  strategyPrompts,
  toVerdict,
} from "./agent.js";
import { GateRunner } from "./gates.js";
import {
  spawnCandidate,
  adoptWinner,
  abandonLoser,
} from "./gitevo-integration.js";
import { evo_checkpoint } from "../../gitevo/dist/operations.js";
import type { Candidate, EscalationReport, GateResult, LineageDiagnostic, RunStats, SolveResult, TaskSpec } from "./types.js";
import { compareBranches, type BranchInfo } from "./judge.js";

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

/**
 * Run verification using GateRunner when gate fields present, otherwise fall back to verify_cmd.
 */
async function runVerification(spec: TaskSpec, cwd: string) {
  if (spec.build_cmd || spec.test_cmd || spec.lint_cmd) {
    const gateRunner = new GateRunner({
      build_cmd: spec.build_cmd,
      test_cmd: spec.test_cmd,
      lint_cmd: spec.lint_cmd,
      verify_cmd: spec.verify_cmd,
    });
    const gateResults = await gateRunner.runAll(cwd);
    const allPassed = gateResults.every((r) => r.passed);
    const output = gateResults
      .filter((r) => !r.passed)
      .map((r) => `=== FAILED: ${r.gate} ===\n${r.diagnostics}`)
      .join("\n\n");
    return {
      verdict: {
        passed: allPassed,
        exit_code: allPassed ? 0 : 1,
        output,
        duration_ms: gateResults.reduce((s, r) => s + r.elapsed_ms, 0),
      },
      gateResults,
    };
  }
  const raw = runCommand(spec.verify_cmd, cwd);
  return { verdict: toVerdict(raw) };
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

  // ── Phase 1: Create solve checkpoint ──────────────────────────────

  onProgress?.("Creating solve checkpoint...");
  try {
    evo_checkpoint("solve", "solve attempt checkpoint");
  } catch (err) {
    onProgress?.(`Failed to create solve checkpoint: ${err} — aborting`);
    return {
      outcome: "escalate",
      escalation: {
        failure_signature: "checkpoint_failed",
        lineages_attempted: 0,
        lineage_diagnostics: [],
        summary: `Failed to create gitevo checkpoint: ${err}`,
      },
      stats,
    };
  }

  // ── Phase 2: Sequential candidate generation, verification, and repair ──

  const strategies = strategyPrompts(spec.goal, numParallel, spec.context);
  onProgress?.(`Testing ${numParallel} strategies sequentially on git branches...`);

  const candidates: Candidate[] = [];
  const passingBranches: BranchInfo[] = [];
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

  STRATEGY_LOOP: for (let i = 0; i < strategies.length; i++) {
    const branchName = `solve-strategy-${i}`;
    const stratLabel = STRATEGY_LABELS[i % STRATEGY_LABELS.length];

    // Spawn git branch for this strategy
    onProgress?.(`  [${i + 1}] spawning branch '${branchName}' (${stratLabel})...`);
    try {
      await spawnCandidate("solve", branchName, spec.cwd);
    } catch (err) {
      onProgress?.(`  [${i + 1}] branch spawn failed — skipping`);
      diagnostics.push({
        lineage_id: `strategy-${i}`,
        strategy: stratLabel,
        timed_out: false,
        claude_exit_code: -1,
        claude_no_output: true,
        claude_output_sample: "",
        repair_attempts: 0,
        final_status: "failed",
      });
      continue;
    }

    // Run claude -p on this branch
    onProgress?.(`  [${i + 1}] running strategy: ${stratLabel}...`);
    const r = await spawnClaude(strategies[i], {
      cwd: spec.cwd,
      model: spec.model,
      apiKey: spec.api_key,
      useProxy: proxyReady,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });

    const hasOutput = r.output.trim().length > 0;

    if (r.timedOut) {
      onProgress?.(`  [${i + 1}] timed out — abandoning`);
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
      await abandonLoser(branchName, `timed out`, spec.cwd).catch(() => {});
      continue;
    }

    if (!hasOutput) {
      onProgress?.(`  [${i + 1}] no output from claude -p (exit ${r.exitCode}) — abandoning`);
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
      await abandonLoser(branchName, `no output from claude -p`, spec.cwd).catch(() => {});
      continue;
    }

    // Commit candidate changes on branch
    execSync("git add -A", { cwd: spec.cwd });
    execSync(`git commit -m "solve strategy ${i}"`, { cwd: spec.cwd });

    const candidate: Candidate = {
      plan_id: `strategy-${i}`,
      patch: r.output.slice(0, 500),
      repair_count: 0,
      status: "verifying",
    };
    candidates.push(candidate);
    stats.candidates_generated++;

    // Run verification
    const { verdict, gateResults } = await runVerification(spec, spec.cwd);
    candidate.verdict = verdict;
    if (gateResults) (candidate as any).gateResults = gateResults;

    if (verdict.exit_code === 0) {
      candidate.status = "passed";
      const branchDiff = (() => {
        try {
          return execSync("git diff evo-solve HEAD", { cwd: spec.cwd, encoding: "utf-8", timeout: 10_000 }) || "";
        } catch { return ""; }
      })();
      passingBranches.push({
        name: branchName,
        diff: branchDiff,
        score: 1,
        verificationReport: verdict.output,
      });
      onProgress?.(`  [${i + 1}] PASSED in ${r.durationMs}ms! (collecting, ${passingBranches.length} so far)`);
      execSync("git checkout master || git checkout main", { cwd: spec.cwd, stdio: "ignore" });
      continue;
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

    // ── Repair loop for this candidate (on same branch) ──
    for (let repair = 1; repair <= MAX_REPAIRS; repair++) {
      onProgress?.(`    Repair attempt ${repair}/${MAX_REPAIRS} for ${candidate.plan_id}...`);

      const diag = diagnostics.find((d) => d.lineage_id === candidate.plan_id);
      if (diag) diag.repair_attempts = repair;

      const prompt = repairPrompt(spec.goal, candidate.verdict?.output ?? "", repair, spec.context);

      const repairResult = await spawnClaude(prompt, {
        cwd: spec.cwd,
        model: spec.model,
        apiKey: spec.api_key,
        useProxy: proxyReady,
        timeoutMs: REPAIR_TIMEOUT_MS,
      });

      if (repairResult.timedOut) {
        onProgress?.(`      → timed out`);
        if (diag) diag.final_status = "timed_out";
        break;
      }

      // Commit repair changes on same branch
      execSync("git add -A", { cwd: spec.cwd });
      execSync(`git commit -m "solve strategy ${i} repair ${repair}"`, { cwd: spec.cwd });

      stats.candidates_generated++;

      const { verdict: repairVerdict, gateResults: repairGateResults } = await runVerification(spec, spec.cwd);
      candidate.verdict = repairVerdict;
      if (repairGateResults) (candidate as any).gateResults = repairGateResults;
      candidate.repair_count = repair;
      candidate.patch = `repair #${repair} output (${repairResult.exitCode}):\n${repairResult.output.slice(0, 500)}`;

      if (repairVerdict.exit_code === 0) {
        candidate.status = "passed";
        if (diag) {
          diag.final_status = "passed";
          diag.verify_exit_code = 0;
          diag.verify_output_sample = repairVerdict.output.slice(0, 300);
        }
        const branchDiff = (() => {
          try {
            return execSync("git diff evo-solve HEAD", { cwd: spec.cwd, encoding: "utf-8", timeout: 10_000 }) || "";
          } catch { return ""; }
        })();
        passingBranches.push({
          name: branchName,
          diff: branchDiff,
          score: 1,
          verificationReport: repairVerdict.output,
        });
        onProgress?.(`      → REPAIR ${repair} PASSED! (collecting, ${passingBranches.length} so far)`);
        execSync("git checkout master || git checkout main", { cwd: spec.cwd, stdio: "ignore" });
        continue STRATEGY_LOOP;
      }

      const sig = hashFailure(repairVerdict.output);

      // Stuck detection: same failure signature after repair
      if (candidate.failure_signature && sig === candidate.failure_signature) {
        onProgress?.(`      → stuck (same failure after repair ${repair})`);
        if (diag) {
          diag.final_status = "stuck";
          diag.verify_exit_code = repairVerdict.exit_code;
          diag.verify_output_sample = repairVerdict.output.slice(0, 300);
        }
        break;
      }

      candidate.failure_signature = sig;
      failureSignatures.add(sig);
      onProgress?.(`      → still failing: ${repairVerdict.output.slice(0, 100)}`);
    }

    // All repairs exhausted — abandon this candidate's branch
    onProgress?.(`  [${i + 1}] abandoning '${branchName}'`);
    await abandonLoser(branchName, `strategy ${i}: all ${MAX_REPAIRS} repairs failed`, spec.cwd).catch(() => {});
  }

  // ── Phase 4: Winner selection ────────────────────────────────────────

  stats.duration_ms = Date.now() - startTime;
  if (costBefore) {
    const costAfter = await getProxyCost();
    if (costAfter) stats.tokens_consumed = costAfter.total_tokens - costBefore.total_tokens;
  }

  if (passingBranches.length === 0) {
    // ── Phase 4a: Escalation ──
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

    onProgress?.(`Escalating: ${escalation.summary}`);

    return {
      outcome: "escalate",
      escalation,
      stats,
    };
  }

  if (passingBranches.length === 1) {
    // ── Phase 4b: Single winner — adopt directly ──
    const winner = passingBranches[0].name;
    onProgress?.(`Single passing candidate '${winner}' — adopting directly`);
    await adoptWinner(winner, spec.cwd);
    return {
      outcome: "pass",
      patch: captureDiff(spec.cwd) ?? passingBranches[0].diff,
      verification_report: passingBranches[0].verificationReport,
      stats,
    };
  }

  // ── Phase 4c: Multiple winners — LLM judge picks best ──
  onProgress?.(`${passingBranches.length} candidates passed — running LLM judge...`);
  const judgeResult = await compareBranches(passingBranches, {
    cwd: spec.cwd,
    model: spec.model,
    apiKey: spec.api_key,
    useProxy: proxyReady,
  });

  const winner = judgeResult.winner;
  if (!winner) {
    onProgress?.("Judge returned no winner — adopting first passing candidate");
    const first = passingBranches[0];
    await adoptWinner(first.name, spec.cwd);
    return {
      outcome: "pass",
      patch: captureDiff(spec.cwd) ?? first.diff,
      verification_report: first.verificationReport,
      stats,
    };
  }

  // Abandon losers (except winner)
  for (const pb of passingBranches) {
    if (pb.name !== winner) {
      execSync(`git checkout ${pb.name}`, { cwd: spec.cwd, stdio: "ignore" });
      await abandonLoser(pb.name, `judge selected ${winner}`, spec.cwd).catch(() => {});
    }
  }

  // Adopt winner
  execSync("git checkout master || git checkout main", { cwd: spec.cwd, stdio: "ignore" });
  await adoptWinner(winner, spec.cwd);

  const winningBranch = passingBranches.find((pb) => pb.name === winner);
  onProgress?.(`Winner: '${winner}'${judgeResult.fallback ? " (fallback scoring)" : " (LLM judge)"}`);

  return {
    outcome: "pass",
    patch: captureDiff(spec.cwd) ?? winningBranch?.diff ?? "",
    verification_report: winningBranch?.verificationReport,
    judge_verdict: judgeResult.verdict ?? undefined,
    stats,
  };
}
