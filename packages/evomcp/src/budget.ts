/**
 * Budget tracking — token and wall-time budgets per playbook stage.
 *
 * Evo-goals.md: "Budget caps per task with automatic escalation when exceeded."
 * "Track cost per verified unit of work as the primary metric."
 *
 * Features:
 *  - Per-stage token + wall-time budgets
 *  - Warnings at 50%, 80%, 95% thresholds
 *  - Auto-escalation signal when budget exceeded
 *  - Cost per verified graph edge tracking (primary metric)
 *  - JSON-serializable for persistence across sessions
 */

// ── Types ──────────────────────────────────────────────────────────────

export type BudgetStage = "spec" | "test_author" | "implement" | "harden" | "review" | "merge" | "total";

export interface StageBudget {
  /** Token budget for this stage. */
  tokenLimit: number;
  /** Wall-time budget in ms for this stage. */
  timeLimitMs: number;
}

export interface StageConsumption {
  /** Tokens consumed so far in this stage. */
  tokensUsed: number;
  /** Wall-clock ms consumed so far in this stage. */
  timeUsedMs: number;
  /** Number of attempts made in this stage. */
  attempts: number;
  /** Number of successfully verified graph edges produced. */
  verifiedEdges: number;
}

export interface BudgetWarning {
  stage: BudgetStage;
  /** Percentage consumed (0.0–1.0). */
  fraction: number;
  /** "50" | "80" | "95" | "100" */
  threshold: "50" | "80" | "95" | "100";
  /** Which resource triggered the warning. */
  resource: "tokens" | "time" | "both";
}

export interface BudgetState {
  stages: Record<BudgetStage, StageBudget>;
  consumption: Record<BudgetStage, StageConsumption>;
  warnings: BudgetWarning[];
  /** Overall status. */
  exhausted: boolean;
  /** Primary metric: cost per verified graph edge. */
  costPerVerifiedEdge: number | null;
}

// ── Default budgets ────────────────────────────────────────────────────

const DEFAULT_STAGE_BUDGETS: Record<BudgetStage, StageBudget> = {
  spec: { tokenLimit: 20_000, timeLimitMs: 300_000 },
  test_author: { tokenLimit: 50_000, timeLimitMs: 600_000 },
  implement: { tokenLimit: 200_000, timeLimitMs: 1_800_000 },
  harden: { tokenLimit: 50_000, timeLimitMs: 600_000 },
  review: { tokenLimit: 30_000, timeLimitMs: 300_000 },
  merge: { tokenLimit: 10_000, timeLimitMs: 120_000 },
  total: { tokenLimit: 500_000, timeLimitMs: 3_600_000 },
};

const TOKEN_COST_PER_1K = 0.00027; // DeepSeek v4 pricing ~$0.27/1M tokens

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Create a fresh budget state with default limits.
 */
export function createBudgetState(overrides?: Partial<Record<BudgetStage, Partial<StageBudget>>>): BudgetState {
  const stages: Record<BudgetStage, StageBudget> = { ...DEFAULT_STAGE_BUDGETS };

  if (overrides) {
    for (const [stage, partial] of Object.entries(overrides)) {
      if (stages[stage as BudgetStage]) {
        stages[stage as BudgetStage] = { ...stages[stage as BudgetStage], ...partial };
      }
    }
  }

  const consumption: Record<BudgetStage, StageConsumption> = {} as Record<BudgetStage, StageConsumption>;
  for (const stage of Object.keys(stages) as BudgetStage[]) {
    consumption[stage] = { tokensUsed: 0, timeUsedMs: 0, attempts: 0, verifiedEdges: 0 };
  }

  return {
    stages,
    consumption,
    warnings: [],
    exhausted: false,
    costPerVerifiedEdge: null,
  };
}

/**
 * Record token consumption for a stage. Returns any new warnings.
 */
export function recordTokens(state: BudgetState, stage: BudgetStage, tokens: number): BudgetState {
  const newState = cloneState(state);
  newState.consumption[stage].tokensUsed += tokens;
  newState.consumption.total.tokensUsed += tokens;

  checkWarnings(newState, stage);
  checkExhaustion(newState);
  updateCostPerEdge(newState);

  return newState;
}

/**
 * Record wall-time consumption for a stage. Returns any new warnings.
 */
export function recordTime(state: BudgetState, stage: BudgetStage, ms: number): BudgetState {
  const newState = cloneState(state);
  newState.consumption[stage].timeUsedMs += ms;
  newState.consumption.total.timeUsedMs += ms;

  checkWarnings(newState, stage);
  checkExhaustion(newState);

  return newState;
}

/**
 * Record an attempt (token + time) for a stage.
 */
export function recordAttempt(state: BudgetState, stage: BudgetStage, tokens: number, ms: number): BudgetState {
  let newState = recordTokens(state, stage, tokens);
  newState = recordTime(newState, stage, ms);
  newState.consumption[stage].attempts++;
  newState.consumption.total.attempts++;
  return newState;
}

/**
 * Record a successfully verified graph edge.
 */
export function recordVerifiedEdge(state: BudgetState, stage: BudgetStage, count = 1): BudgetState {
  const newState = cloneState(state);
  newState.consumption[stage].verifiedEdges += count;
  newState.consumption.total.verifiedEdges += count;
  updateCostPerEdge(newState);
  return newState;
}

/**
 * Check if a stage's budget is fully exhausted.
 */
export function isStageExhausted(state: BudgetState, stage: BudgetStage): boolean {
  const budget = state.stages[stage];
  const consumption = state.consumption[stage];
  return consumption.tokensUsed >= budget.tokenLimit || consumption.timeUsedMs >= budget.timeLimitMs;
}

/**
 * Get the fraction consumed for a stage (max of token fraction and time fraction).
 */
export function fractionConsumed(state: BudgetState, stage: BudgetStage): number {
  const budget = state.stages[stage];
  const consumption = state.consumption[stage];
  const tokenFraction = budget.tokenLimit > 0 ? consumption.tokensUsed / budget.tokenLimit : 0;
  const timeFraction = budget.timeLimitMs > 0 ? consumption.timeUsedMs / budget.timeLimitMs : 0;
  return Math.max(tokenFraction, timeFraction);
}

/**
 * Get the total dollar cost so far.
 */
export function totalCost(state: BudgetState): number {
  return state.consumption.total.tokensUsed * (TOKEN_COST_PER_1K / 1000);
}

/**
 * Human-readable summary of budget state.
 */
export function budgetSummary(state: BudgetState): string {
  const lines: string[] = ["## Budget Summary", ""];

  for (const stage of Object.keys(state.stages) as BudgetStage[]) {
    if (stage === "total") continue;
    const frac = fractionConsumed(state, stage);
    const pct = (frac * 100).toFixed(0);
    const bar = consumptionBar(frac);
    const tokens = state.consumption[stage].tokensUsed;
    const edges = state.consumption[stage].verifiedEdges;
    lines.push(`| ${stage.padEnd(12)} | ${bar} ${pct}% | ${tokens.toLocaleString()} tokens | ${edges} edges |`);
  }

  lines.push(
    "",
    `**Total**: ${state.consumption.total.tokensUsed.toLocaleString()} tokens, ${state.consumption.total.verifiedEdges} verified edges`,
  );

  if (state.costPerVerifiedEdge !== null) {
    lines.push(`**Cost per edge**: $${state.costPerVerifiedEdge.toFixed(4)}`);
  }

  if (state.exhausted) {
    lines.push("", "⚠️ **BUDGET EXHAUSTED** — escalate to next rung.");
  }

  return lines.join("\n");
}

// ── Internal ───────────────────────────────────────────────────────────

function cloneState(state: BudgetState): BudgetState {
  return {
    stages: { ...state.stages },
    consumption: JSON.parse(JSON.stringify(state.consumption)),
    warnings: [...state.warnings],
    exhausted: state.exhausted,
    costPerVerifiedEdge: state.costPerVerifiedEdge,
  };
}

function checkWarnings(state: BudgetState, stage: BudgetStage): void {
  const frac = fractionConsumed(state, stage);
  const thresholds: { threshold: BudgetWarning["threshold"]; value: number }[] = [
    { threshold: "100", value: 1.0 },
    { threshold: "95", value: 0.95 },
    { threshold: "80", value: 0.8 },
    { threshold: "50", value: 0.5 },
  ];

  for (const { threshold, value } of thresholds) {
    if (frac >= value) {
      const alreadyWarned = state.warnings.some((w) => w.stage === stage && w.threshold === threshold);
      if (!alreadyWarned) {
        const tokenFrac =
          state.stages[stage].tokenLimit > 0 ? state.consumption[stage].tokensUsed / state.stages[stage].tokenLimit : 0;
        const timeFrac =
          state.stages[stage].timeLimitMs > 0
            ? state.consumption[stage].timeUsedMs / state.stages[stage].timeLimitMs
            : 0;

        let resource: BudgetWarning["resource"];
        if (tokenFrac >= value && timeFrac >= value) resource = "both";
        else if (tokenFrac >= value) resource = "tokens";
        else resource = "time";

        state.warnings.push({
          stage,
          fraction: frac,
          threshold,
          resource,
        });
      }
      break; // Only report the highest threshold hit
    }
  }
}

function checkExhaustion(state: BudgetState): void {
  const total = state.consumption.total;
  state.exhausted =
    total.tokensUsed >= state.stages.total.tokenLimit || total.timeUsedMs >= state.stages.total.timeLimitMs;
}

function updateCostPerEdge(state: BudgetState): void {
  const edges = state.consumption.total.verifiedEdges;
  if (edges > 0) {
    state.costPerVerifiedEdge = totalCost(state) / edges;
  }
}

function consumptionBar(fraction: number): string {
  const filled = Math.round(fraction * 10);
  const empty = 10 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}
