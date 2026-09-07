import type {
  ClassificationConfigStatus,
} from "./classification-config-status.js";
import type { DiscoveryFilters } from "./discovery-filters.js";
import type { DiscoveryResult } from "./discovery-result.js";
import type { DiscoverySearchResponse } from "./discovery-search-response.js";
import type { SymbolIdentity } from "../semantic/api/public-api.js";

export type DiscoveryPipeline = {
  search(
    query: string,
    filters: DiscoveryFilters,
    symbols?: readonly SymbolIdentity[],
  ): DiscoveryResult[];
  searchResult(
    query: string,
    filters: DiscoveryFilters,
    symbols?: readonly SymbolIdentity[],
  ): DiscoverySearchResponse;
  status(): ClassificationConfigStatus;
};
