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
import * as fs from "node:fs";
import * as path from "node:path";
import { evo_checkpoint } from "../../gitevo/dist/operations.js";
import {
  type AgentResult,
  computeFailureSignals,
  ensureProxy,
  extractScore,
  getProxyCost,
  hashFailure,
  type ProxyCostSnapshot,
  proxyTokenDelta,
  repairPrompt,
  runCommand,
  spawnClaude,
  strategyPrompts,
  toVerdict,
} from "./agent.js";
import { budgetSummary, createBudgetState, recordAttempt } from "./budget.js";
import {
  type AttemptSummary,
  assembleContext,
  type ContextLayers,
  type FailureSignature,
  generateFactSheet,
  type TargetFileContent,
} from "./context.js";
import { deduplicatePlans } from "./dedup.js";
import { detectDegenerate, isDegenerateReject } from "./degenerate.js";
import {
  createEscalationState,
  type EscalationDecision,
  type EscalationState,
  evaluateEscalation,
  recordFailure,
  type TriggerSignals,
} from "./escalation.js";
import { compileFeedback } from "./feedback.js";
import { GateRunner } from "./gates.js";
import { commitOrNoop, getRootBranch } from "./git-helpers.js";
import { abandonLoser, adoptWinner, spawnCandidate } from "./gitevo-integration.js";
import { type BranchInfo, compareBranches } from "./judge.js";
import { STRATEGIES, STRATEGY_LABELS } from "./prompts.js";
import type { Candidate, EscalationReport, LineageDiagnostic, Plan, RunStats, SolveResult, TaskSpec } from "./types.js";

const DEFAULT_N = 5;
const DEFAULT_TIMEOUT_MS = 300_000; // 5 min per claude -p instance
const REPAIR_TIMEOUT_MS = 180_000; // 3 min for repairs

/**
 * Bounded-concurrency map: runs `fn` on each item, at most `limit` at a time.
 * Workers pick from a shared queue — fill rates adapt naturally to variable task durations.
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
      const idx = queue.shift();
      if (idx === undefined) return;
      results[idx] = await fn(items[idx], idx);
    }
  };
  const count = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}

/** Capture git diff between root branch and strategy branch (three-dot merge-base syntax).
 *  Works from any branch — shows changes in strategyBranch since it diverged from rootBranch. */
function captureBranchDiff(rootBranch: string, strategyBranch: string, cwd: string): string {
  try {
    const diff = execSync(`git diff ${rootBranch}...${strategyBranch}`, {
      cwd,
      encoding: "utf-8",
      timeout: 10_000,
    });
    return diff || "";
  } catch {
    return "";
  }
}

/** Capture git diff for the working tree — used as fallback at final return. */
function captureDiff(cwd: string): string | null {
  try {
    const diff = execSync("git diff HEAD", { cwd, encoding: "utf-8", timeout: 10_000 });
    return diff || null;
  } catch {
    return null;
  }
}

// ── Strategy detection ───────────────────────────────────────────────────

/**
 * Detect whether a command produces scalar fitness output.
 * Runs the verify_cmd once; if stdout contains a numeric score (exit 0),
 * it's treated as a scalar fitness metric — route to evolve instead of solve.
 */
export function detectScalarFitness(cmd: string, cwd: string): boolean {
  try {
    const result = runCommand(cmd, cwd, 30_000);
    if (result.exitCode !== 0) return false;
    const score = extractScore(result.output);
    return score !== null;
  } catch {
    return false;
  }
}

// ── Glob matching for allowed_files ───────────────────────────────────────

/**
 * Match a file path against a single glob pattern.
 * Handles * (any except /), ** (any including /), ? (single char except /).
 */
export function matchGlob(filePath: string, pattern: string): boolean {
  let regex = "";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === "*" && i + 1 < pattern.length && pattern[i + 1] === "*") {
      // Handle ** (globstar)
      i += 2;
      if (i < pattern.length && pattern[i] === "/") {
        // **/ — zero or more path segments (patterns like src/**/*.ts)
        regex += "(.+/)?";
        i++;
      } else {
        // ** at end — matches everything remaining (patterns like a/b/**)
        regex += ".*";
      }
    } else if (ch === "*") {
      // Single * — matches anything except /
      regex += "[^/]*";
      i++;
    } else if (ch === "?") {
      // ? — matches single char except /
      regex += "[^/]";
      i++;
    } else if (/[.+^${}()|\\]/.test(ch)) {
      // Escape regex special chars
      regex += `\\${ch}`;
      i++;
    } else {
      regex += ch;
      i++;
    }
  }

  try {
    return new RegExp(`^${regex}$`).test(filePath);
  } catch {
    return false;
  }
}

/**
 * Extract file paths from a git diff and check each against allowed_files patterns.
 * Returns list of violating file paths (empty = all clean).
 */
export function filesMatchGlob(diff: string, patterns: string[]): string[] {
  if (!patterns || patterns.length === 0) return [];
  const filePaths: string[] = [];
  const diffRe = /^diff --git a\/(.+?) b\/(.+?)$/gm;
  for (const match of diff.matchAll(diffRe)) {
    const bPath = match[2];
    if (bPath && !filePaths.includes(bPath)) filePaths.push(bPath);
  }
  const violating: string[] = [];
  for (const fp of filePaths) {
    const matched = patterns.some((p) => matchGlob(fp, p));
    if (!matched) violating.push(fp);
  }
  return violating;
}

/**
 * Find all files in a directory matching a glob pattern.
 * Supports * (any within a dir), ** (recursive), and ? (single char).
 */
function findFilesMatchingGlob(rootDir: string, pattern: string): string[] {
  const results: string[] = [];

  if (pattern.includes("**")) {
    // Recursive walk from root
    const prefix = pattern.split("/**")[0];
    const baseDir = path.resolve(rootDir, prefix);
    const _suffix = pattern.slice(prefix.length + 3); // after /**
    if (fs.existsSync(baseDir) && fs.statSync(baseDir).isDirectory()) {
      walkDir(baseDir, (filePath) => {
        const rel = path.relative(rootDir, filePath).replace(/\\/g, "/");
        if (matchGlob(rel, pattern)) {
          results.push(filePath);
        }
      });
    }
  } else {
    // Non-recursive: resolve the full path, check if it matches
    const fullPath = path.resolve(rootDir, pattern);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      results.push(fullPath);
    } else {
      // Try as a directory pattern (e.g. src/*.ts)
      const dir = path.dirname(fullPath);
      const basename = path.basename(fullPath);
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        for (const entry of fs.readdirSync(dir)) {
          if (matchGlob(entry, basename)) {
            const fp = path.join(dir, entry);
            if (fs.statSync(fp).isFile()) results.push(fp);
          }
        }
      }
    }
  }

  return results;
}

/** Recursive directory walker. */
function walkDir(dir: string, cb: (filePath: string) => void): void {
  try {
    for (const entry of fs.readdirSync(dir)) {
      const fp = path.join(dir, entry);
      if (fs.statSync(fp).isDirectory()) {
        walkDir(fp, cb);
      } else {
        cb(fp);
      }
    }
  } catch {
    // skip unreadable dirs
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

  // Budget tracking (token/time limits per solve run)
  let budget = createBudgetState({
    implement: { tokenLimit: spec.budget_tokens ?? 100_000 },
    total: { tokenLimit: spec.budget_tokens ?? 100_000 },
  });
  const emittedBudgetWarnings = new Set<string>();

  // Per-lineage escalation states for repair loop
  const lineageEscStates = new Map<string, EscalationState>();

  // Per-lineage cumulative token tracking (proxy global counter delta per lineage)
  let totalLineageTokens = -1;

  // ── Plan dedup: ensure strategy diversity ─────────────────────────

  const strategyPlans: Plan[] = [];
  for (let i = 0; i < numParallel; i++) {
    strategyPlans.push({
      id: `strategy-${i}`,
      summary: STRATEGIES[i % STRATEGIES.length],
    });
  }
  stats.plans_sampled = strategyPlans.length;

  // Dedup based on token-overlap heuristic (>65% overlap → duplicate)
  const dedupedPlans = deduplicatePlans(strategyPlans);
  stats.plans_deduped = dedupedPlans.length;

  // ── Phase 1: Create solve checkpoint ──────────────────────────────

  onProgress?.("Creating solve checkpoint...");
  try {
    evo_checkpoint("solve", "solve attempt checkpoint", spec.cwd);
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

  // Capture root branch once for restoring after each strategy
  const rootBranch = getRootBranch(spec.cwd);

  // ── Build curated context for strategy prompts ──────────────────────

  const targetContents: TargetFileContent[] = [];
  if (spec.allowed_files && spec.allowed_files.length > 0) {
    for (const pattern of spec.allowed_files) {
      try {
        // Walk cwd recursively and match files with matchGlob
        const found = findFilesMatchingGlob(spec.cwd, pattern);
        for (const fp of found) {
          targetContents.push({
            path: path.relative(spec.cwd, fp),
            content: fs.readFileSync(fp, "utf-8"),
          });
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  const factSheet = generateFactSheet(spec.cwd);
  const goalWithCtx = spec.context ? `${spec.goal}\n\nAdditional context: ${spec.context}` : spec.goal;
  const baseLayers: ContextLayers = {
    goal: goalWithCtx,
    targetFiles: targetContents.length > 0 ? targetContents : undefined,
    constraints: factSheet ? { lintRules: "", conventions: factSheet, typeConfig: "" } : undefined,
  };
  const baseCuratedContext = assembleContext(baseLayers);

  // ── Phase 2: Branch spawn (serial) ─────────────────────────────────

  const strategies = strategyPrompts(spec.goal, dedupedPlans.length, baseCuratedContext);
  onProgress?.(
    `Spawning ${strategies.length} git branches (${stats.plans_sampled} plans sampled, ${stats.plans_deduped} after dedup)...`,
  );

  const candidates: Candidate[] = [];
  const passingBranches: BranchInfo[] = [];
  const degenerateRejections: string[] = [];
  const failureSignatures = new Set<string>();
  /** Per-lineage signature history for stuck/oscillating/noProgress detection. */
  const lineageSignatureHistory = new Map<string, string[]>();
  const diagnostics: LineageDiagnostic[] = [];

  interface LineageSlot {
    index: number;
    branchName: string;
    stratLabel: string;
    prompt: string;
    costBeforeLineage: ProxyCostSnapshot | null;
    // Shared mutation: Phase 3 reads what Phase 2 writes
    spawnResult: AgentResult | null;
  }

  const slots: LineageSlot[] = [];

  for (let i = 0; i < strategies.length; i++) {
    const branchName = `solve-strategy-${i}`;
    const stratLabel = STRATEGY_LABELS[i % STRATEGY_LABELS.length];
    const costBeforeLineage = proxyReady ? await getProxyCost() : null;

    onProgress?.(`  [${i + 1}] spawning branch '${branchName}' (${stratLabel})...`);
    try {
      await spawnCandidate("solve", branchName, spec.cwd);
    } catch (_err) {
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
      const delta0 = await proxyTokenDelta(costBeforeLineage);
      if (delta0 > 0) {
        const di = diagnostics[diagnostics.length - 1];
        di.lineage_tokens = delta0;
        totalLineageTokens = totalLineageTokens < 0 ? delta0 : totalLineageTokens + delta0;
      }
      continue;
    }

    slots.push({
      index: i,
      branchName,
      stratLabel,
      prompt: strategies[i],
      costBeforeLineage,
      spawnResult: null,
    });
  }

  // ── Phase 3: Parallel claude -p (bounded concurrency) ───────────────

  const concurrency = Math.min(slots.length, 4);
  onProgress?.(`Running ${slots.length} strategies with concurrency ${concurrency}...`);

  await mapConcurrent(slots, concurrency, async (slot): Promise<void> => {
    // Checkout the branch (synchronous execSync — event-loop serialized)
    try {
      execSync(`git checkout ${slot.branchName}`, { cwd: spec.cwd, timeout: 10_000, stdio: "ignore" });
    } catch {
      onProgress?.(`  [${slot.index + 1}] checkout failed — skipping`);
      slot.spawnResult = null;
      return;
    }

    onProgress?.(`  [${slot.index + 1}] running strategy: ${slot.stratLabel}...`);
    const r = await spawnClaude(slot.prompt, {
      cwd: spec.cwd,
      model: spec.model,
      apiKey: spec.api_key,
      useProxy: proxyReady,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    slot.spawnResult = r;
  });

  // ── Phase 4: Serial per-lineage commit + verify + repair ────────────

  for (let idx = 0; idx < slots.length; idx++) {
    const slot = slots[idx];
    const { index: i, branchName, stratLabel, costBeforeLineage } = slot;
    const r = slot.spawnResult;

    // Record token consumption helper
    const recordTokenDelta = async () => {
      const delta = await proxyTokenDelta(costBeforeLineage);
      if (delta > 0) {
        const di = diagnostics.find((d) => d.lineage_id === `strategy-${i}`);
        if (di) di.lineage_tokens = delta;
        totalLineageTokens = totalLineageTokens < 0 ? delta : totalLineageTokens + delta;
      }
    };

    if (!r) {
      // Spawn failed in Phase 2 (checkout failure) — already handled
      await recordTokenDelta();
      continue;
    }

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
      await recordTokenDelta();
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
      await recordTokenDelta();
      continue;
    }

    // Ensure we're on the right branch before committing
    try {
      execSync(`git checkout ${branchName}`, { cwd: spec.cwd, timeout: 10_000, stdio: "ignore" });
    } catch {
      onProgress?.(`  [${i + 1}] checkout for commit failed — skipping`);
      await recordTokenDelta();
      continue;
    }

    // Commit candidate changes on branch
    const commitResult = commitOrNoop(spec.cwd, `solve strategy ${i}`);

    const candidate: Candidate = {
      plan_id: `strategy-${i}`,
      patch: commitResult.committed ? captureBranchDiff(rootBranch, branchName, spec.cwd) : "",
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
      const branchDiff = captureBranchDiff(rootBranch, branchName, spec.cwd);

      // ── Degenerate detection ──────────────────────────────────────
      const degenerateReport = detectDegenerate(branchDiff);
      if (isDegenerateReject(degenerateReport)) {
        candidate.status = "degenerate";
        candidate.degenerate_signals = degenerateReport.findings.map((f) => ({
          type: f.type,
          severity: f.severity,
          message: f.message,
          file: f.file,
          line: f.line,
        }));
        degenerateRejections.push(`${branchName}: ${degenerateReport.summary}`);
        onProgress?.(`  [${i + 1}] PASSED verify but REJECTED by degenerate detection: ${degenerateReport.summary}`);
        execSync(`git checkout ${rootBranch}`, { cwd: spec.cwd, stdio: "ignore" });
        await recordTokenDelta();
        continue;
      }

      // ── Allowed files enforcement ──────────────────────────────────
      if (spec.allowed_files && spec.allowed_files.length > 0) {
        const violating = filesMatchGlob(branchDiff, spec.allowed_files);
        if (violating.length > 0) {
          candidate.status = "degenerate";
          degenerateRejections.push(`${branchName}: touches files outside allowed_files: ${violating.join(", ")}`);
          onProgress?.(`  [${i + 1}] PASSED verify but touches files outside allowed_files: ${violating.join(", ")}`);
          execSync(`git checkout ${rootBranch}`, { cwd: spec.cwd, stdio: "ignore" });
          await recordTokenDelta();
          continue;
        }
      }

      passingBranches.push({
        name: branchName,
        diff: branchDiff,
        score: 1,
        verificationReport: verdict.output,
      });
      onProgress?.(`  [${i + 1}] PASSED in ${r.durationMs}ms! (collecting, ${passingBranches.length} so far)`);
      execSync(`git checkout ${rootBranch}`, { cwd: spec.cwd, stdio: "ignore" });
      await recordTokenDelta();
      continue;
    }

    candidate.status = "failed";
    candidate.failure_signature = hashFailure(verdict.output, spec.cwd);
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

    // ── Track attempts for curated context across repairs ──
    const repairAttempts: AttemptSummary[] = [
      {
        strategy: stratLabel,
        outcome: "failed",
        summary: (candidate.verdict?.output ?? "").slice(0, 500),
        failureSignature: candidate.failure_signature,
      },
    ];

    // Initialize per-lineage signature history for stuck/oscillating/noProgress detection
    const sigHistory: string[] = [];
    if (candidate.failure_signature) {
      sigHistory.push(candidate.failure_signature);
    }
    lineageSignatureHistory.set(candidate.plan_id, sigHistory);

    // ── Repair loop for this candidate (on same branch, serial per lineage) ──
    // Per-lineage escalation state tracks progress through retry -> resample -> ... -> human rungs
    let escState = createEscalationState();
    lineageEscStates.set(candidate.plan_id, escState);
    let repair = 1;
    let repairActive = true;
    let escDecision: EscalationDecision = { action: "continue", reason: "starting", state: escState };

    while (repairActive && !budget.exhausted) {
      onProgress?.(`    Repair attempt ${repair} for ${candidate.plan_id}...`);

      const diag = diagnostics.find((d) => d.lineage_id === candidate.plan_id);
      if (diag) diag.repair_attempts = repair;

      // Build context with growing prior attempts + failure signatures
      const failureSigs: FailureSignature[] = [];
      for (const a of repairAttempts) {
        if (a.failureSignature) {
          failureSigs.push({ hash: a.failureSignature, description: a.summary.slice(0, 200), count: 1 });
        }
      }
      const repairLayers: ContextLayers = {
        ...baseLayers,
        priorAttempts: repairAttempts.length > 0 ? repairAttempts : undefined,
        failureSignatures: failureSigs.length > 0 ? failureSigs : undefined,
      };
      const repairCtx = assembleContext(repairLayers);

      const failOutput = candidate.verdict?.output ?? "";
      const feedback = compileFeedback(failOutput, spec.cwd, "verify");
      const prompt = repairPrompt(spec.goal, feedback, repair, repairCtx);

      const repairResult = await spawnClaude(prompt, {
        cwd: spec.cwd,
        model: spec.model,
        apiKey: spec.api_key,
        useProxy: proxyReady,
        timeoutMs: REPAIR_TIMEOUT_MS,
      });

      if (repairResult.timedOut) {
        onProgress?.(`      -> timed out`);
        if (diag) diag.final_status = "timed_out";
        break;
      }

      // Commit repair changes on same branch
      const repairCommitResult = commitOrNoop(spec.cwd, `solve strategy ${i} repair ${repair}`);

      stats.candidates_generated++;

      const { verdict: repairVerdict, gateResults: repairGateResults } = await runVerification(spec, spec.cwd);
      candidate.verdict = repairVerdict;
      if (repairGateResults) (candidate as any).gateResults = repairGateResults;
      candidate.repair_count = repair;
      candidate.patch = repairCommitResult.committed ? captureBranchDiff(rootBranch, branchName, spec.cwd) : "";

      if (repairVerdict.exit_code === 0) {
        candidate.status = "passed";
        if (diag) {
          diag.final_status = "passed";
          diag.verify_exit_code = 0;
          diag.verify_output_sample = repairVerdict.output.slice(0, 300);
        }
        const branchDiff = captureBranchDiff(rootBranch, branchName, spec.cwd);

        // -- Degenerate detection on repair --
        const degenerateReport = detectDegenerate(branchDiff);
        if (isDegenerateReject(degenerateReport)) {
          candidate.status = "degenerate";
          candidate.degenerate_signals = degenerateReport.findings.map((f) => ({
            type: f.type,
            severity: f.severity,
            message: f.message,
            file: f.file,
            line: f.line,
          }));
          degenerateRejections.push(`${branchName}: ${degenerateReport.summary}`);
          onProgress?.(
            `      -> REPAIR ${repair} PASSED verify but REJECTED by degenerate detection: ${degenerateReport.summary}`,
          );
          execSync(`git checkout ${rootBranch}`, { cwd: spec.cwd, stdio: "ignore" });
          await recordTokenDelta();
          // eslint-disable-next-line no-labels
          break;
        }

        // ── Allowed files enforcement (repair) ─────────────────────
        if (spec.allowed_files && spec.allowed_files.length > 0) {
          const violating = filesMatchGlob(branchDiff, spec.allowed_files);
          if (violating.length > 0) {
            candidate.status = "degenerate";
            degenerateRejections.push(`${branchName}: touches files outside allowed_files: ${violating.join(", ")}`);
            onProgress?.(`      -> REPAIR ${repair} touches files outside allowed_files: ${violating.join(", ")}`);
            execSync(`git checkout ${rootBranch}`, { cwd: spec.cwd, stdio: "ignore" });
            await recordTokenDelta();
            break;
          }
        }

        passingBranches.push({
          name: branchName,
          diff: branchDiff,
          score: 1,
          verificationReport: repairVerdict.output,
        });
        onProgress?.(`      -> REPAIR ${repair} PASSED! (collecting, ${passingBranches.length} so far)`);
        execSync(`git checkout ${rootBranch}`, { cwd: spec.cwd, stdio: "ignore" });
        await recordTokenDelta();
        // eslint-disable-next-line no-labels
        break;
      }

      const sig = hashFailure(repairVerdict.output, spec.cwd);
      sigHistory.push(sig);

      // Compute failure signals from the full history (B5)
      const b5Signals = computeFailureSignals(sigHistory);

      // Store signals in diagnostic for escalation
      if (diag) {
        diag.signature_history = {
          signatures: [...sigHistory],
          stuck: b5Signals.stuck,
          oscillating: b5Signals.oscillating,
          noProgress: b5Signals.noProgress,
        };
        if (b5Signals.stuck) diag.failure_mode = "stuck";
        else if (b5Signals.oscillating) diag.failure_mode = "oscillating";
        else if (b5Signals.noProgress) diag.failure_mode = "noProgress";
      }

      // Record failure in escalation state
      escState = recordFailure(escState);

      // Build trigger signals: combine B5 signals with budget exhaustion
      const triggerSignals: TriggerSignals = {
        stuck: b5Signals.stuck,
        oscillating: b5Signals.oscillating,
        noProgress: b5Signals.noProgress,
        budgetExhausted: budget.exhausted,
        timeExhausted: false,
      };

      // Evaluate escalation decision (retry -> resample -> re-decompose -> stronger-model -> human)
      escDecision = evaluateEscalation(escState, triggerSignals);
      escState = escDecision.state;
      lineageEscStates.set(candidate.plan_id, escState);

      // Emit budget warnings at 50/80/95/100% thresholds
      for (const w of budget.warnings) {
        const wkey = `${w.stage}:${w.threshold}`;
        if (!emittedBudgetWarnings.has(wkey)) {
          emittedBudgetWarnings.add(wkey);
          onProgress?.(`      ! Budget: ${w.stage} at ${w.threshold}% (${w.resource})`);
        }
      }

      // Act on escalation decision
      if (escDecision.action === "continue") {
        // Continue repair cycle -- escalation state tracks attempts within rung
        candidate.failure_signature = sig;
        failureSignatures.add(sig);
        repairAttempts.push({
          strategy: stratLabel,
          outcome: "failed",
          summary: repairVerdict.output.slice(0, 500),
          failureSignature: sig,
        });
        repair++;
        onProgress?.(`      -> still failing: ${repairVerdict.output.slice(0, 100)}`);
        continue;
      }

      // Escalation or abort
      onProgress?.(`      -> ${escDecision.reason}`);

      if (escDecision.action === "escalate" && escDecision.nextRung === "stronger-model") {
        // Stronger model requested -- try if a more capable model is configured
        const currentModel = spec.model ?? "";
        if (!(currentModel.includes("sonnet") || currentModel.includes("opus"))) {
          onProgress?.(`      Stronger model requested but no alternative configured -- aborting lineage`);
        }
        // Fall through to abandon
      }

      if (escDecision.action === "escalate" && escDecision.nextRung === "resample") {
        // Resample: continue with another attempt using different approach
        // The escalation state has advanced to the resample rung with new maxAttempts
        candidate.failure_signature = sig;
        failureSignatures.add(sig);
        repairAttempts.push({
          strategy: stratLabel,
          outcome: "failed",
          summary: repairVerdict.output.slice(0, 500),
          failureSignature: sig,
        });
        repair++;
        onProgress?.(`      Resampling (new approach) for ${candidate.plan_id}`);
        continue;
      }

      // re-decompose, human, or unhandled escalation -> stop this lineage
      if (diag) {
        diag.final_status = "stuck";
        diag.verify_exit_code = repairVerdict.exit_code;
        diag.verify_output_sample = repairVerdict.output.slice(0, 300);
      }
      repairActive = false;
      break;
    }

    // Abandon this candidate's branch
    onProgress?.(`  [${i + 1}] abandoning '${branchName}'`);
    const abandonReason = budget.exhausted
      ? `strategy ${i}: budget exhausted after ${escState.totalAttempts} attempts`
      : `strategy ${i}: escalated to ${escState.currentRung} after ${escState.totalAttempts} attempts`;
    await abandonLoser(branchName, abandonReason, spec.cwd).catch(() => {});

    await recordTokenDelta();

    // Record budget consumption for this lineage
    const budgetDiag = diagnostics.find((d) => d.lineage_id === candidate.plan_id);
    const tDelta = budgetDiag?.lineage_tokens ?? 0;
    if (tDelta > 0) {
      budget = recordAttempt(budget, "implement", tDelta, Date.now() - startTime);
      // Emit any new budget warnings
      for (const w of budget.warnings) {
        const wkey = `${w.stage}:${w.threshold}`;
        if (!emittedBudgetWarnings.has(wkey)) {
          emittedBudgetWarnings.add(wkey);
          onProgress?.(`   Budget: ${w.stage} at ${w.threshold}% (${w.resource})`);
        }
      }
    }
  }

  // ── Phase 5: Winner selection ────────────────────────────────────────

  stats.duration_ms = Date.now() - startTime;
  stats.tokens_consumed = totalLineageTokens;

  onProgress?.(budgetSummary(budget));

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
      lineages_attempted: strategies.length,
      lineage_diagnostics: diagnostics,
      summary: [
        `${strategies.length} strategies attempted (${stats.plans_sampled} sampled, ${stats.plans_deduped} after dedup), ${stats.candidates_generated} candidates generated.`,
        `Best exit code: ${bestCandidate?.verdict?.exit_code ?? "N/A"}`,
        dominantSig ? `${dominantSig[1]} lineages hit same failure pattern.` : "No common failure pattern.",
        "Escalate to Claude: solve the specific failing assertion directly.",
      ].join(" "),
    };

    if (degenerateRejections.length > 0) {
      const degeneratMsg = `Degenerate rejections (${degenerateRejections.length}): ${degenerateRejections.join("; ")}`;
      escalation.summary += ` ${degeneratMsg}`;
    }
    onProgress?.(`Escalating: ${escalation.summary}`);

    return {
      outcome: "escalate",
      escalation,
      stats,
      degenerate_rejections: degenerateRejections.length > 0 ? degenerateRejections : undefined,
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
      degenerate_rejections: degenerateRejections.length > 0 ? degenerateRejections : undefined,
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
      degenerate_rejections: degenerateRejections.length > 0 ? degenerateRejections : undefined,
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
  execSync(`git checkout ${rootBranch}`, { cwd: spec.cwd, stdio: "ignore" });
  await adoptWinner(winner, spec.cwd);

  const winningBranch = passingBranches.find((pb) => pb.name === winner);
  onProgress?.(`Winner: '${winner}'${judgeResult.fallback ? " (fallback scoring)" : " (LLM judge)"}`);

  return {
    outcome: "pass",
    patch: captureDiff(spec.cwd) ?? winningBranch?.diff ?? "",
    verification_report: winningBranch?.verificationReport,
    judge_verdict: judgeResult.verdict ?? undefined,
    stats,
    degenerate_rejections: degenerateRejections.length > 0 ? degenerateRejections : undefined,
  };
}
