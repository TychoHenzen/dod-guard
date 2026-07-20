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
import { ensureProxy, extractScore, getProxyCost, mutationPrompt, runCommand, spawnClaude } from "./agent.js";
import type { FitnessHistoryPoint } from "./convergence.js";
import { checkConvergence } from "./convergence.js";
import { GateRunner } from "./gates.js";
import { abandonLoser, adoptWinner, checkpointGeneration, spawnCandidate } from "./gitevo-integration.js";
import type { EvolveResult, EvolveSpec, GateResult, RunStats } from "./types.js";

const DEFAULT_GENERATIONS = 5;
const DEFAULT_POPULATION = 6;
const DEFAULT_TIMEOUT_MS = 180_000; // 3 min per mutation

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

  const proxyReady = await ensureProxy();
  if (!proxyReady) {
    onProgress?.("WARNING: deepclaude proxy not running. Attempting direct mode...");
  }

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

  // Snapshot proxy cost before spawning subprocesses
  const costBefore = proxyReady ? await getProxyCost() : null;

  // ── Read target files ───────────────────────────────────────────────

  const targetContents = readTargetFiles(spec.cwd, spec.target_files);
  if (targetContents.length === 0) {
    throw new Error(`No target files found matching: ${spec.target_files.join(", ")}`);
  }
  const _initialCode = targetContents.map((t) => `=== ${t.path} ===\n${t.content}`).join("\n\n");

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
    evo_checkpoint("evolve-baseline", "baseline before evolution");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress?.(`Baseline checkpoint note: ${msg}`);
  }

  // Remember root branch so we can return to it if no improvement found
  let rootBranch: string;
  try {
    rootBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: spec.cwd, timeout: 5_000 }).toString().trim();
  } catch {
    rootBranch = "master";
  }

  for (let gen = 0; gen < generations; gen++) {
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
        spec.context,
      );
      prompts.push(prompt);
    }

    // Sequential candidate evaluation (NO Promise.all -- each candidate runs one at a time)
    onProgress?.(`  Evaluating ${populationSize} candidates (sequential)...`);
    const genScores: number[] = [];

    for (let i = 0; i < populationSize; i++) {
      const branchName = `evolve-gen${gen}-candidate${i}`;

      // a) Spawn a new git branch from the generation checkpoint
      try {
        await spawnCandidate(`evolve-gen${gen}`, branchName, spec.cwd);
      } catch (err) {
        onProgress?.(`  [${i + 1}] spawn failed: ${String(err).slice(0, 80)}`);
        continue;
      }

      // b) Run claude -p on this branch (sequential)
      const result = await spawnClaude(prompts[i], {
        cwd: spec.cwd,
        model: spec.model,
        apiKey: spec.api_key,
        useProxy: proxyReady,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      }).catch((err) => {
        onProgress?.(`  [${i + 1}] claude failed: ${String(err)}`);
        return { output: "", exitCode: -1, durationMs: 0, timedOut: false };
      });

      stats.candidates_generated++;

      // c) If claude -p failed, abandon the branch and move on
      if (result.timedOut || result.exitCode !== 0) {
        onProgress?.(`  [${i + 1}] claude -p failed (exit=${result.exitCode}${result.timedOut ? ", timed out" : ""})`);
        try {
          await abandonLoser(branchName, `claude -p failed (exit=${result.exitCode})`, spec.cwd);
        } catch {}
        continue;
      }

      // d) Commit candidate changes to the branch
      try {
        execSync("git add -A", { cwd: spec.cwd, timeout: 10_000 });
        execSync(`git commit -m "evolve gen${gen} candidate${i}"`, { cwd: spec.cwd, timeout: 10_000 });
      } catch {
        onProgress?.(`  [${i + 1}] no changes produced by claude -p`);
        try {
          await abandonLoser(branchName, "no changes produced", spec.cwd);
        } catch {}
        continue;
      }

      // e) Measure fitness on the committed code
      try {
        const fitnessResult = runCommand(spec.fitness_cmd, spec.cwd);
        const score = extractScore(fitnessResult.output);

        if (score === null) {
          onProgress?.(`  [${i + 1}] no numeric score in fitness output`);
          try {
            await abandonLoser(branchName, "no numeric score", spec.cwd);
          } catch {}
          continue;
        }

        // f) Run gates if configured -- fail fast on broken candidates
        if (spec.build_cmd || spec.test_cmd || spec.lint_cmd) {
          const { passed, results: gateResults } = await runGates(spec, spec.cwd, onProgress);
          if (!passed) {
            onProgress?.(
              `  [${i + 1}] score=${score.toFixed(2)}, GATES FAILED (${gateResults
                .filter((r) => !r.passed)
                .map((r) => r.gate)
                .join(", ")}) -- skipping`,
            );
            try {
              await abandonLoser(branchName, "gates failed", spec.cwd);
            } catch {}
            continue;
          }
        }

        genScores.push(score);
        onProgress?.(`  [${i + 1}] score=${score.toFixed(2)}`);

        const isBetter = higherIsBetter ? score > bestScore : score < bestScore;
        if (isBetter) {
          bestScore = score;
          bestBranch = branchName;
          onProgress?.(`    -> NEW BEST: ${score.toFixed(2)}`);

          // Store actual source code as elite example for future mutation prompts
          const eliteCode = readTargetFiles(spec.cwd, spec.target_files)
            .map((t) => `=== ${t.path} ===\n${t.content}`)
            .join("\n\n");
          elites.push({ code: eliteCode.slice(0, 2000), score });
          elites.sort((a, b) => (higherIsBetter ? b.score - a.score : a.score - b.score));
          if (elites.length > 5) elites.length = 5;
        } else {
          // g) Not better than current best -- abandon the branch
          try {
            await abandonLoser(
              branchName,
              `score ${score.toFixed(2)} not better than best ${bestScore.toFixed(2)}`,
              spec.cwd,
            );
          } catch {}
        }
      } catch (err) {
        onProgress?.(`  [${i + 1}] error: ${String(err).slice(0, 80)}`);
        try {
          await abandonLoser(branchName, `error: ${String(err).slice(0, 60)}`, spec.cwd);
        } catch {}
      }
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

  stats.duration_ms = Date.now() - startTime;

  // Compute token delta from proxy cost snapshot
  if (costBefore) {
    const costAfter = await getProxyCost();
    if (costAfter) stats.tokens_consumed = costAfter.total_tokens - costBefore.total_tokens;
  }

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
