export type FreshnessCause =
  | "freshness_unavailable"
  | "incomplete_write"
  | "scan_limit"
  | "workspace_churn";
