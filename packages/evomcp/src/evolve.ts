/**
 * Scalar-fitness evolutionary optimizer.
 *
 * Uses `claude -p` subprocesses as the mutation operator. Each generation:
 *  1. Read current population members from target files
 *  2. Spawn N `claude -p` instances to generate mutations
 *  3. Apply each patch, measure fitness via fitness_cmd
 *  4. Select elites for next generation
 *  5. Repeat for N generations
 *
 * Fitness is scalar — dense enough for population dynamics to work.
 * Best used for: "make this function faster", "reduce complexity",
 * "improve test coverage", "reduce memory usage".
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { spawnClaude, runCommand, extractScore, ensureProxy, mutationPrompt } from "./agent.js";
import type { EvolveSpec, EvolveResult, RunStats, Candidate } from "./types.js";

const DEFAULT_GENERATIONS = 5;
const DEFAULT_POPULATION = 6;
const DEFAULT_TIMEOUT_MS = 180_000; // 3 min per mutation

export async function evolve(
  spec: EvolveSpec,
  onProgress?: (msg: string) => void,
): Promise<EvolveResult> {
  const startTime = Date.now();
  const stats: RunStats = {
    plans_sampled: 0,
    plans_deduped: 0,
    candidates_generated: 0,
    tokens_consumed: 0,
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

  // ── Read target files ───────────────────────────────────────────────

  const targetContents = readTargetFiles(spec.cwd, spec.target_files);
  if (targetContents.length === 0) {
    throw new Error(`No target files found matching: ${spec.target_files.join(", ")}`);
  }
  const initialCode = targetContents.map((t) => `=== ${t.path} ===\n${t.content}`).join("\n\n");

  // ── Phase 2: Evolutionary loop ──────────────────────────────────────

  let bestScore = baselineScore;
  let bestPatch = "";
  const fitnessHistory: { generation: number; best_score: number; mean_score: number }[] = [];
  const elites: { code: string; score: number }[] = [];

  for (let gen = 0; gen < generations; gen++) {
    onProgress?.(`\nGeneration ${gen + 1}/${generations} (best so far: ${bestScore.toFixed(2)})`);

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

    // Spawn all mutations in parallel
    onProgress?.(`  Spawning ${populationSize} mutations...`);
    const results = await Promise.all(
      prompts.map((p, i) =>
        spawnClaude(p, {
          cwd: spec.cwd,
          model: spec.model,
          apiKey: spec.api_key,
          useProxy: proxyReady,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        }).catch((err) => {
          onProgress?.(`  Mutation ${i} failed: ${String(err)}`);
          return { output: "", exitCode: -1, durationMs: 0, timedOut: false };
        }),
      ),
    );

    stats.candidates_generated += results.length;

    // Apply each patch, score fitness
    const genScores: number[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.timedOut || r.exitCode !== 0) continue;

      // Save current state so we can revert
      const backupDir = path.join(os.tmpdir(), `evomcp-backup-${Date.now()}`);
      saveState(spec.cwd, backupDir);

      try {
        // Apply claude's changes (claude -p already wrote to files via tools)
        // Run fitness command
        const fitnessResult = runCommand(spec.fitness_cmd, spec.cwd);
        const score = extractScore(fitnessResult.output);

        if (score !== null) {
          genScores.push(score);
          onProgress?.(`  [${i + 1}] score=${score.toFixed(2)}`);

          const isBetter = higherIsBetter ? (score > bestScore) : (score < bestScore);
          if (isBetter) {
            bestScore = score;
            // Capture the current state as best patch
            bestPatch = captureState(spec.cwd, spec.target_files);
            onProgress?.(`    → NEW BEST: ${score.toFixed(2)}`);

            elites.push({ code: fitnessResult.output.slice(0, 2000), score });
            // Keep only top 5 elites
            elites.sort((a, b) => higherIsBetter ? b.score - a.score : a.score - b.score);
            if (elites.length > 5) elites.length = 5;
          }
        }
      } catch (err) {
        onProgress?.(`  [${i + 1}] error: ${String(err).slice(0, 80)}`);
      } finally {
        // Revert to best state for next generation
        restoreState(spec.cwd, backupDir);
      }
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
      onProgress?.(`  Gen ${gen + 1}: no valid scores — keeping best=${bestScore.toFixed(2)}`);
    }
  }

  // ── Phase 3: Final verification ─────────────────────────────────────

  onProgress?.("\nApplying best patch for final verification...");
  // Apply the best patch
  if (bestPatch) {
    applyPatch(bestPatch, spec.cwd);
  }

  const finalResult = runCommand(spec.fitness_cmd, spec.cwd);
  const finalScore = extractScore(finalResult.output) ?? bestScore;

  stats.duration_ms = Date.now() - startTime;

  return {
    best_patch: bestPatch || "(no improvement over baseline)",
    best_score: finalScore,
    baseline_score: baselineScore,
    fitness_history: fitnessHistory,
    verification_report: [
      `Baseline: ${baselineScore.toFixed(2)}`,
      `Final: ${finalScore.toFixed(2)}`,
      `Improvement: ${(higherIsBetter ? finalScore - baselineScore : baselineScore - finalScore).toFixed(2)}`,
      "",
      fitnessHistory.map((h) => `Gen ${h.generation}: best=${h.best_score.toFixed(2)} mean=${h.mean_score.toFixed(2)}`).join("\n"),
      "",
      finalResult.output.slice(0, 2000),
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
    } catch { /* skip */ }
  }
  return files;
}

function matchSimple(name: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$",
  );
  return regex.test(name);
}

function saveState(cwd: string, backupDir: string): void {
  try {
    execSync(`git stash push --include-untracked -m "evomcp-backup"`, { cwd, timeout: 10_000 });
  } catch {
    // Stash may fail if nothing to stash — that's fine
  }
}

function restoreState(cwd: string, backupDir: string): void {
  try {
    execSync(`git checkout .`, { cwd, timeout: 10_000 });
    execSync(`git clean -fd`, { cwd, timeout: 10_000 });
    // Pop stash if it exists
    try {
      execSync(`git stash pop`, { cwd, timeout: 10_000 });
    } catch {
      // No stash to pop — fine
    }
  } catch {
    // Best-effort restore
  }
}

function captureState(cwd: string, targetFiles: string[]): string {
  try {
    const diff = execSync(`git diff -- ${targetFiles.join(" ")}`, { cwd, encoding: "utf-8", timeout: 10_000 });
    return diff || "(no diff from baseline)";
  } catch {
    return "(failed to capture diff)";
  }
}

function applyPatch(patch: string, cwd: string): void {
  if (!patch || patch.includes("(no improvement") || patch.includes("(no diff")) return;

  const patchFile = path.join(os.tmpdir(), `evomcp-best-${Date.now()}.patch`);
  try {
    fs.writeFileSync(patchFile, patch, "utf-8");
    execSync(`git apply "${patchFile}"`, { cwd, timeout: 30_000 });
  } catch {
    // Patch may not apply cleanly — the changes might already be in place
  } finally {
    try { fs.unlinkSync(patchFile); } catch {}
  }
}
