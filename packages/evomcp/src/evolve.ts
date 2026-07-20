/**
 * Scalar-fitness evolutionary optimizer.
 *
 * Uses `claude -p` subprocesses as the mutation operator. Each generation:
 *  1. Read current population members from target files
 *  2. Create gitevo generation checkpoint for rollback
 *  3. Spawn N `claude -p` instances SEQUENTIALLY (one candidate at a time)
 *  4. Each candidate runs on its own git branch via gitevo checkpoint/spawn
 *  5. Measure fitness, keep best branch (elite), abandon losers
 *  6. Checkout best branch -> next generation builds on cumulative best
 *  7. Repeat for N generations
 *  8. Adopt winner branch via gitevo
 *
 * Fitness is scalar -- dense enough for population dynamics to work.
 * Best used for: "make this function faster", "reduce complexity",
 * "improve test coverage", "reduce memory usage".
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { evo_checkpoint } from "../../gitevo/dist/operations.js";
import type { AgentResult } from "./agent.js";
import {
  ensureProxy,
  extractScore,
  getProxyCost,
  mutationPrompt,
  proxyTokenDelta,
  runCommand,
  spawnClaude,
} from "./agent.js";
import {
  assembleContext,
  type ContextLayers,
  generateFactSheet,
  makeTargetFiles,
} from "./context.js";
import { detectDegenerate, isDegenerateReject } from "./degenerate.js";
import type { FitnessHistoryPoint } from "./convergence.js";
import { checkConvergence } from "./convergence.js";
import { GateRunner } from "./gates.js";
import { commitOrNoop, getRootBranch } from "./git-helpers.js";
import { abandonLoser, adoptWinner, checkpointGeneration, spawnCandidate } from "./gitevo-integration.js";
import type { EvolveResult, EvolveSpec, GateResult, RunStats } from "./types.js";
import { createBudgetState, type BudgetState, recordAttempt, budgetSummary } from "./budget.js";
import { createEscalationState, type EscalationState } from "./escalation.js";

const DEFAULT_GENERATIONS = 5;
const DEFAULT_POPULATION = 6;
const DEFAULT_TIMEOUT_MS = 180_000; // 3 min per mutation

/**
 * Bounded-concurrency map: runs `fn` on each item, at most `limit` at a time.
 */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const queue = items.map((_, i) => i);
  const worker = async () => {
    while (queue.length > 0) {
      const idx = queue.shift()!;
      results[idx] = await fn(items[idx], idx);
    }
  };
  const count = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}

/**
 * Run gates when gate fields (build_cmd/test_cmd/lint_cmd) are configured.
 * Returns pass/fail + results. When no gate fields, trivially passes.
 */
async function runGates(
  spec: EvolveSpec,
  cwd: string,
  onProgress?: (msg: string) => void,
): Promise<{ passed: boolean; results: GateResult[] }> {
  if (!(spec.build_cmd || spec.test_cmd || spec.lint_cmd)) {
    return { passed: true, results: [] };
  }

  const gateRunner = new GateRunner({
    build_cmd: spec.build_cmd,
    test_cmd: spec.test_cmd,
    lint_cmd: spec.lint_cmd,
  });

  const results = await gateRunner.runAll(cwd);
  const allPassed = results.every((r) => r.passed);

  for (const r of results) {
    if (r.passed) {
      onProgress?.(`    gate ${r.gate}: PASSED (${r.elapsed_ms}ms)`);
    } else {
      const diag = r.diagnostics.slice(0, 200);
      onProgress?.(`    gate ${r.gate}: FAILED (${r.elapsed_ms}ms)\n      ${diag.replace(/\n/g, "\n      ")}`);
    }
  }

  return { passed: allPassed, results };
}

export async function evolve(spec: EvolveSpec, onProgress?: (msg: string) => void): Promise<EvolveResult> {
  const startTime = Date.now();
  const stats: RunStats = {
    plans_sampled: 0,
    plans_deduped: 0,
    candidates_generated: 0,
    tokens_consumed: -1,
    duration_ms: 0,
    model: spec.model ?? "deepseek-v4-pro[1m]",
  };

  const generations = spec.generations ?? DEFAULT_GENERATIONS;
  const populationSize = spec.population_size ?? DEFAULT_POPULATION;
  const higherIsBetter = spec.higher_is_better ?? false;

  // Budget tracking (token limits per evolve run)
  let budget = createBudgetState({
    implement: { tokenLimit: spec.budget_tokens ?? 200_000 },
    total: { tokenLimit: spec.budget_tokens ?? 200_000 },
  });
  const emittedBudgetWarnings = new Set<string>();

  // Escalation state (created for completeness; actively used in solve's repair loop)
  const evolveEscState = createEscalationState();

  const proxyReady = await ensureProxy();
  if (!proxyReady) {
    onProgress?.("WARNING: deepclaude proxy not running. Attempting direct mode...");
  }

  // Per-candidate cumulative token tracking
  let totalCandidateTokens = -1;

  // ── Phase 1: Baseline ───────────────────────────────────────────────

  onProgress?.("Measuring baseline fitness...");
  const baselineResult = runCommand(spec.fitness_cmd, spec.cwd);
  const baselineScore = extractScore(baselineResult.output);
  if (baselineScore === null) {
    throw new Error(
      `Fitness command did not emit a numeric score to stdout.\nCommand: ${spec.fitness_cmd}\nOutput: ${baselineResult.output.slice(0, 500)}`,
    );
  }
  onProgress?.(`Baseline fitness: ${baselineScore.toFixed(2)}`);

  // Run gates on baseline to confirm starting point passes
  {
    const { passed } = await runGates(spec, spec.cwd, onProgress);
    if (!passed) {
      onProgress?.("WARNING: baseline code fails gates -- check config or fix baseline first");
    }
  }

  // ── Read target files ───────────────────────────────────────────────

  const targetContents = readTargetFiles(spec.cwd, spec.target_files);
  if (targetContents.length === 0) {
    throw new Error(`No target files found matching: ${spec.target_files.join(", ")}`);
  }

  // ── Build curated context for mutation prompts ─────────────────────

  const factSheet = generateFactSheet(spec.cwd);
  const goalWithCtx = spec.context ? `${spec.goal}\n\nAdditional context: ${spec.context}` : spec.goal;
  const evolveLayers: ContextLayers = {
    goal: goalWithCtx,
    targetFiles: makeTargetFiles(targetContents),
    constraints: factSheet
      ? { lintRules: "", conventions: factSheet, typeConfig: "" }
      : undefined,
  };
  const evolveCtx = assembleContext(evolveLayers);

  // ── Phase 2: Evolutionary loop (gitevo-aware) ──────────────────────

  let bestScore = baselineScore;
  let bestBranch: string | null = null;
  const fitnessHistory: { generation: number; best_score: number; mean_score: number }[] = [];
  const elites: { code: string; score: number }[] = [];

  // Track early exit (convergence/stagnation/oscillation) for result
  const earlyExit: {
    converged?: boolean;
    convergence_reason?: string;
    stagnated?: boolean;
    stagnation_reason?: string;
  } = {};

  // Create baseline checkpoint before evolution starts
  try {
    evo_checkpoint("evolve-baseline", "baseline before evolution", spec.cwd);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress?.(`Baseline checkpoint note: ${msg}`);
  }

  // Remember root branch so we can return to it if no improvement found
  const rootBranch = getRootBranch(spec.cwd);

  for (let gen = 0; gen < generations; gen++) {
    // Check budget exhaustion before starting a new generation
    if (budget.exhausted) {
      onProgress?.(`Budget exhausted — stopping after ${gen} generations`);
      // Emit any un-reported budget warnings
      for (const w of budget.warnings) {
        const wkey = `${w.stage}:${w.threshold}`;
        if (!emittedBudgetWarnings.has(wkey)) {
          emittedBudgetWarnings.add(wkey);
          onProgress?.(`  Budget: ${w.stage} at ${w.threshold}% (${w.resource})`);
        }
      }
      break;
    }

    // Emit budget warnings at thresholds
    for (const w of budget.warnings) {
      const wkey = `${w.stage}:${w.threshold}`;
      if (!emittedBudgetWarnings.has(wkey)) {
        emittedBudgetWarnings.add(wkey);
        onProgress?.(`  Budget: ${w.stage} at ${w.threshold}% (${w.resource})`);
      }
    }
    onProgress?.(`\nGeneration ${gen + 1}/${generations} (best so far: ${bestScore.toFixed(2)})`);

    // Tag generation checkpoint -- enables rollback to start of gen
    await checkpointGeneration(gen, `Generation ${gen + 1} checkpoint`, spec.cwd);

    // Build mutation prompts for each population member
    const prompts: string[] = [];
    for (let i = 0; i < populationSize; i++) {
      const targetFile = targetContents[i % targetContents.length];
      const prompt = mutationPrompt(
        spec.goal,
        targetFile.content,
        bestScore,
        elites.slice(0, 3), // Top 3 elites as examples
        evolveCtx,
      );
      prompts.push(prompt);
    }

    // ── Phase 1: Serial branch spawn ────────────────────────────
    interface EvoSlot {
      index: number;
      branchName: string;
      prompt: string;
      costBefore: any;
      result: AgentResult | null;
    }

    const evoSlots: EvoSlot[] = [];
    for (let i = 0; i < populationSize; i++) {
      const branchName = `evolve-gen${gen}-candidate${i}`;
      try {
        await spawnCandidate(`evolve-gen${gen}`, branchName, spec.cwd);
      } catch (err) {
        onProgress?.(`  [${i + 1}] spawn failed: ${String(err).slice(0, 80)}`);
        continue;
      }
      evoSlots.push({
        index: i,
        branchName,
        prompt: prompts[i],
        costBefore: proxyReady ? await getProxyCost() : null,
        result: null,
      });
    }

    // ── Phase 2: Parallel claude -p (bounded concurrency) ─────────
    const concurrency = Math.min(evoSlots.length, 4);
    onProgress?.(`  Running ${evoSlots.length} mutation calls with concurrency ${concurrency}...`);

    await mapConcurrent(evoSlots, concurrency, async (slot): Promise<void> => {
      try {
        execSync(`git checkout ${slot.branchName}`, { cwd: spec.cwd, timeout: 10_000, stdio: "ignore" });
      } catch {
        slot.result = null;
        return;
      }
      const r = await spawnClaude(slot.prompt, {
        cwd: spec.cwd,
        model: spec.model,
        apiKey: spec.api_key,
        useProxy: proxyReady,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      }).catch((err) => {
        onProgress?.(`  [${slot.index + 1}] claude failed: ${String(err)}`);
        return { output: "", exitCode: -1, durationMs: 0, timedOut: false };
      });
      slot.result = r;
    });

    // ── Phase 3: Serial per-candidate commit + fitness + gates ───
    onProgress?.(`  Processing ${evoSlots.length} candidates serially...`);
    const genScores: number[] = [];

    for (const slot of evoSlots) {
      const { index: i, branchName, costBefore: costBeforeCandidate, result } = slot;

      if (!result) {
        continue;
      }

      const processCost = async () => {
        const _d = await proxyTokenDelta(costBeforeCandidate);
        if (_d > 0) {
          totalCandidateTokens = totalCandidateTokens < 0 ? _d : totalCandidateTokens + _d;
          budget = recordAttempt(budget, "implement", _d, Date.now() - startTime);
        }
      };

      stats.candidates_generated++;

      if (result.timedOut || result.exitCode !== 0) {
        onProgress?.(`  [${i + 1}] claude -p failed (exit=${result.exitCode}${result.timedOut ? ", timed out" : ""})`);
        try {
          await abandonLoser(branchName, `claude -p failed (exit=${result.exitCode})`, spec.cwd);
        } catch {}
        await processCost();
        continue;
      }

      try {
        execSync(`git checkout ${branchName}`, { cwd: spec.cwd, timeout: 10_000, stdio: "ignore" });
      } catch {
        await processCost();
        continue;
      }

      const commitResult = commitOrNoop(spec.cwd, `evolve gen${gen} candidate${i}`);
      if (!commitResult.committed) {
        onProgress?.(`  [${i + 1}] no changes produced by claude -p`);
        try {
          await abandonLoser(branchName, "no changes produced", spec.cwd);
        } catch {}
        await processCost();
        continue;
      }

      try {
        const fitnessResult = runCommand(spec.fitness_cmd, spec.cwd);
        const score = extractScore(fitnessResult.output);

        if (score === null) {
          onProgress?.(`  [${i + 1}] no numeric score in fitness output`);
        } else {
          if (spec.build_cmd || spec.test_cmd || spec.lint_cmd) {
            const { passed } = await runGates(spec, spec.cwd, onProgress);
            if (!passed) {
              onProgress?.(`  [${i + 1}] score=${score.toFixed(2)}, GATES FAILED -- skipping`);
              try {
                await abandonLoser(branchName, "gates failed", spec.cwd);
              } catch {}
              await processCost();
              continue;
            }
          }

          genScores.push(score);
          onProgress?.(`  [${i + 1}] score=${score.toFixed(2)}`);

          // ── Degenerate detection ──────────────────────────────────
          const branchDiff = execSync(`git diff ${rootBranch}...${branchName}`, {
            cwd: spec.cwd, encoding: "utf-8", timeout: 10_000,
          }).toString() || "";
          const degenerateReport = detectDegenerate(branchDiff);
          if (isDegenerateReject(degenerateReport)) {
            onProgress?.(`    -> DEGENERATE: ${degenerateReport.summary}`);
            try {
              await abandonLoser(branchName, `degenerate: ${degenerateReport.summary}`, spec.cwd);
            } catch {}
            await processCost();
            continue;
          }

          const isBetter = higherIsBetter ? score > bestScore : score < bestScore;
          if (isBetter) {
            bestScore = score;
            bestBranch = branchName;
            onProgress?.(`    -> NEW BEST: ${score.toFixed(2)}`);

            const eliteCode = readTargetFiles(spec.cwd, spec.target_files)
              .map((t) => `=== ${t.path} ===\n${t.content}`)
              .join("\n\n");
            elites.push({ code: eliteCode.slice(0, 2000), score });
            elites.sort((a, b) => (higherIsBetter ? b.score - a.score : a.score - b.score));
            if (elites.length > 5) elites.length = 5;
          } else {
            try {
              await abandonLoser(
                branchName,
                `score ${score.toFixed(2)} not better than best ${bestScore.toFixed(2)}`,
                spec.cwd,
              );
            } catch {}
          }
        }
      } catch (err) {
        onProgress?.(`  [${i + 1}] error: ${String(err).slice(0, 80)}`);
        try {
          await abandonLoser(branchName, `error: ${String(err).slice(0, 60)}`, spec.cwd);
        } catch {}
      }
      await processCost();
    }

    // After generation: checkout best branch so next gen builds on it
    if (bestBranch) {
      try {
        execSync(`git checkout ${bestBranch}`, { cwd: spec.cwd, timeout: 10_000 });
      } catch (err) {
        onProgress?.(`  Warning: could not checkout best branch: ${String(err).slice(0, 60)}`);
      }
    } else {
      // No improvement this gen -- return to root branch for next checkpoint
      try {
        execSync(`git checkout ${rootBranch}`, { cwd: spec.cwd, timeout: 10_000 });
      } catch {}
    }

    if (genScores.length > 0) {
      const meanScore = genScores.reduce((a, b) => a + b, 0) / genScores.length;
      fitnessHistory.push({
        generation: gen + 1,
        best_score: bestScore,
        mean_score: meanScore,
      });
      onProgress?.(`  Gen ${gen + 1}: best=${bestScore.toFixed(2)}, mean=${meanScore.toFixed(2)}`);
    } else {
      fitnessHistory.push({
        generation: gen + 1,
        best_score: bestScore,
        mean_score: bestScore,
      });
      onProgress?.(`  Gen ${gen + 1}: no valid scores -- keeping best=${bestScore.toFixed(2)}`);
    }

    // Check for convergence/stagnation/oscillation after each generation
    const convHistory: FitnessHistoryPoint[] = fitnessHistory.map((h) => ({
      generation: h.generation,
      best_score: h.best_score,
    }));
    const report = checkConvergence(convHistory, genScores);
    if (report.recommendation !== "continue") {
      if (report.converged) {
        earlyExit.converged = true;
        earlyExit.convergence_reason = report.convergence.reason;
        onProgress?.(`\n  CONVERGED: ${report.convergence.reason}`);
      }
      if (report.stagnated) {
        earlyExit.stagnated = true;
        earlyExit.stagnation_reason = report.stagnation.reason;
        onProgress?.(`\n  STAGNATED: ${report.stagnation.reason}`);
      }
      if (report.oscillating) {
        earlyExit.stagnated = true;
        earlyExit.stagnation_reason = report.oscillation.reason;
        onProgress?.(`\n  OSCILLATING: ${report.oscillation.reason}`);
      }
      break;
    }
  }

  // ── Phase 3: Adopt winner + final verification ──────────────────────

  // Adopt the winning branch into root via gitevo
  if (bestBranch) {
    onProgress?.(`\nAdopting winner: ${bestBranch}...`);
    try {
      await adoptWinner(bestBranch, spec.cwd);
    } catch (err) {
      onProgress?.(`  Adoption failed: ${String(err).slice(0, 100)}`);
      // Fallback: checkout best branch's files into working tree
      try {
        execSync(`git checkout ${bestBranch} -- .`, { cwd: spec.cwd, timeout: 10_000 });
      } catch {}
    }
  }

  // Run final gates on adopted result
  let finalGateReport = "";
  if (spec.build_cmd || spec.test_cmd || spec.lint_cmd) {
    onProgress?.("\nFinal gate verification...");
    const { passed, results } = await runGates(spec, spec.cwd, onProgress);
    finalGateReport = results
      .map(
        (r) =>
          `${r.gate}: ${r.passed ? "PASS" : "FAIL"} (${r.elapsed_ms}ms)${!r.passed && r.diagnostics ? `\n  ${r.diagnostics.slice(0, 300)}` : ""}`,
      )
      .join("\n");
    if (!passed) {
      onProgress?.("WARNING: best patch does not pass all gates");
    }
  }

  const finalResult = runCommand(spec.fitness_cmd, spec.cwd);
  const finalScore = extractScore(finalResult.output) ?? bestScore;

  // In the evolve flow, mutation prompts are the "plans" — one per population member per generation.
  // No plan-level dedup in evolve, so sampled = deduped.
  stats.plans_sampled = populationSize * generations;
  stats.plans_deduped = populationSize * generations;
  stats.duration_ms = Date.now() - startTime;
  stats.tokens_consumed = totalCandidateTokens;

  return {
    ...earlyExit,
    best_patch: bestBranch || "(no improvement over baseline)",
    best_score: finalScore,
    baseline_score: baselineScore,
    fitness_history: fitnessHistory,
    verification_report: [
      `Baseline: ${baselineScore.toFixed(2)}`,
      `Final: ${finalScore.toFixed(2)}`,
      `Improvement: ${(higherIsBetter ? finalScore - baselineScore : baselineScore - finalScore).toFixed(2)}`,
      "",
      fitnessHistory
        .map((h) => `Gen ${h.generation}: best=${h.best_score.toFixed(2)} mean=${h.mean_score.toFixed(2)}`)
        .join("\n"),
      "",
      finalResult.output.slice(0, 2000),
      "",
      budgetSummary(budget),
      "",
      finalGateReport,
    ].join("\n"),
    stats,
  };
}

// ── File helpers ───────────────────────────────────────────────────────

interface TargetFile {
  path: string;
  content: string;
}

function readTargetFiles(cwd: string, patterns: string[]): TargetFile[] {
  const files: TargetFile[] = [];
  for (const pattern of patterns) {
    // Simple glob: if pattern is a direct path, read it
    const fullPath = path.resolve(cwd, pattern);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      files.push({ path: pattern, content: fs.readFileSync(fullPath, "utf-8") });
      continue;
    }
    // Try directory glob
    try {
      const dir = path.dirname(fullPath);
      const basename = path.basename(fullPath);
      if (fs.existsSync(dir)) {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          if (matchSimple(entry, basename)) {
            const filePath = path.join(dir, entry);
            if (fs.statSync(filePath).isFile()) {
              files.push({
                path: path.relative(cwd, filePath),
                content: fs.readFileSync(filePath, "utf-8"),
              });
            }
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("evolve: readTargetFiles error", { pattern, err: msg });
    }
  }
  return files;
}

export function matchSimple(name: string, pattern: string): boolean {
  const regex = new RegExp(
    `^${pattern
      .replace(/[.+?^${}()|\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
  );
  return regex.test(name);
}
