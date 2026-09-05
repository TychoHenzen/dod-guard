export type FreshnessCause = "freshness_unavailable" | "incomplete_write" | "scan_limit" | "workspace_churn";
export type FreshnessState = "initializing" | "ready" | "refreshing" | "degraded" | "refresh_failed";
export type FreshnessStatus = {
  current_generation: number;
  pending_generation: number | null;
  state: FreshnessState;
  mode: "watching" | "polling";
  degraded_cause?: FreshnessCause;
};
export type Manifest = ReadonlyMap<string, string>;
export type ReconcileResult = { manifest: Manifest } | { cause: FreshnessCause };
