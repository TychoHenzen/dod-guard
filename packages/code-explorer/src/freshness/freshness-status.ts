import type { FreshnessCause } from "./freshness-cause.js";
import type { FreshnessState } from "./freshness-state.js";

export type FreshnessStatus = {
  current_generation: number;
  pending_generation: number | null;
  state: FreshnessState;
  mode: "watching" | "polling";
  degraded_cause?: FreshnessCause;
};
