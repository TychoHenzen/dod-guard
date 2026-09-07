import type { DiscoveryFilters } from "./discovery-filters.js";
import type { DiscoveryReply } from "./discovery-reply.js";
import type { DiscoveryState } from "./discovery-state.js";
import { loadedSearchState } from "./discovery-search.js";

export async function loadDiscoverySearch(options: {
  owner: object;
  latestSearches: WeakMap<object, Record<string, unknown>>;
  request: Record<string, unknown>;
  current: DiscoveryState;
  filters: DiscoveryFilters;
  searchCore: (request: Record<string, unknown>) => Promise<DiscoveryReply>;
}): Promise<DiscoveryState> {
  try {
    const reply = await options.searchCore(options.request);
    if (options.latestSearches.get(options.owner) !== options.request)
      return options.current;
    return loadedSearchState(options.current, reply, options.filters);
  } catch {
    if (options.latestSearches.get(options.owner) !== options.request)
      return options.current;
    return {
      ...options.current,
      mode: "results",
      areaState: "failed",
      error: "backend_unavailable",
    };
  }
}
