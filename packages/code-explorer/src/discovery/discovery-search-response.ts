import type { DiscoveryFilters } from "./discovery-filters.js";
import type { DiscoveryResult } from "./discovery-result.js";

export type DiscoverySearchResponse = {
  candidates: readonly DiscoveryResult[];
  omitted_candidate_count: number;
  applied_filters: DiscoveryFilters;
  available_narrowing_filters: readonly (keyof DiscoveryFilters)[];
};
