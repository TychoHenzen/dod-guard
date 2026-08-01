/**
 * The mutable ledger for one solve run.
 */

import type { AttemptResult } from "./attempt-result.js";
import { type BudgetState, createBudgetState } from "./budget.js";
import type { RunStats, TaskSpec } from "./types.js";

const DEFAULT_BUDGET_TOKENS = 100_000;
const DEFAULT_MODEL = "deepseek-v4-pro[1m]";

/** Sentinel meaning the token spend could not be measured. */
export const TOKENS_UNMEASURED = -1;

export interface SolveRun {
  /** Every attempt that ran, in order. */
  attempts: AttemptResult[];
  /** Attempts that passed both refusal filters. */
  survivors: AttemptResult[];
  /** One human-readable line per refused candidate. */
  rejections: string[];
  /** Stage and threshold pairs already reported to the caller. */
  warned: Set<string>;
  /** Token and time budget for the run. */
  budget: BudgetState;
  /** Counters returned to the caller. */
  stats: RunStats;
  /** Wall-clock start of the run. */
  startedAt: number;
}

/** Open a ledger with the caller budget and model applied. */
export function createRun(spec: TaskSpec): SolveRun {
  const limit = spec.budget_tokens ?? DEFAULT_BUDGET_TOKENS;
  return {
    attempts: [],
    survivors: [],
    rejections: [],
    warned: new Set(),
    budget: createBudgetState({
      implement: { tokenLimit: limit },
      total: { tokenLimit: limit },
    }),
    stats: {
      plans_sampled: 0,
      plans_deduped: 0,
      candidates_generated: 0,
      tokens_consumed: TOKENS_UNMEASURED,
      duration_ms: 0,
      model: spec.model ?? DEFAULT_MODEL,
    },
    startedAt: Date.now(),
  };
}
