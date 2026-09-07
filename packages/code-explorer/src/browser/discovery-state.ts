import type { DiscoveryCandidate } from "./discovery-candidate.js";
import type { DiscoveryFilters } from "./discovery-filters.js";
import type { BrowserLandmarkGroup } from "./browser-landmark-group.js";

export type DiscoveryState = {
  query: string;
  filters: DiscoveryFilters;
  candidates: readonly DiscoveryCandidate[];
  landmarks: readonly BrowserLandmarkGroup[];
  omittedCount: number;
  refinementGuidance?: string;
  mode: "landmarks" | "results";
  areaState:
    | "not_loaded"
    | "loading"
    | "empty"
    | "unavailable"
    | "stale"
    | "failed"
    | "ready";
  error?: string;
};
