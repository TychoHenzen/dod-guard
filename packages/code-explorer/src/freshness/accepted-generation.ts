import type { FreshnessStatus } from "./freshness-status.js";

export type AcceptedGeneration = {
  accepted_request: number;
  status: FreshnessStatus;
};
