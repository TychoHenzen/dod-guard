/**
 * Plan sampling for the solve fanout.
 *
 * One plan per approach. Near-duplicate approach descriptions drop out before
 * any worker starts, so the fanout never spends two attempts on the same idea.
 */

import { deduplicatePlans } from "./dedup.js";
import { STRATEGIES, STRATEGY_LABELS, strategyPrompts } from "./prompts.js";
import { baseContext, goalWithContext } from "./solve-context.js";
import type { Plan, TaskSpec } from "./types.js";

export interface SolvePlan {
  /** Attempt ordinal after dedup, counted from 0. */
  index: number;
  /** Short name of the approach, used in progress messages. */
  label: string;
  /** Full prompt handed to the worker. */
  prompt: string;
}

function samplePlans(count: number): Plan[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `plan-${i}`,
    summary: STRATEGIES[i % STRATEGIES.length],
  }));
}

/**
 * Sample `count` approaches, drop the near-duplicates, and build one prompt
 * per survivor. The returned length is the deduplicated plan count.
 */
export function buildPlans(spec: TaskSpec, count: number): SolvePlan[] {
  const sampled = samplePlans(count);
  const kept = deduplicatePlans(sampled);
  const prompts = strategyPrompts(goalWithContext(spec), count, baseContext(spec));

  return kept.map((plan, index) => {
    const origin = sampled.indexOf(plan);
    return {
      index,
      label: STRATEGY_LABELS[origin % STRATEGY_LABELS.length],
      prompt: prompts[origin],
    };
  });
}
