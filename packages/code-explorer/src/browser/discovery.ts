import type { BrowserLandmarkGroup } from "./browser-landmark-group.js";
import type { DiscoveryFilters } from "./discovery-filters.js";
import type { DiscoveryReply } from "./discovery-reply.js";
import type { DiscoveryState } from "./discovery-state.js";
import {
  emptySearchState,
  searchRequest,
} from "./discovery-search.js";
import { loadDiscoverySearch } from "./discovery-search-load.js";
import { renderDiscovery } from "./discovery-render.js";

export type { BrowserLandmark } from "./browser-landmark.js";
export type { BrowserLandmarkGroup } from "./browser-landmark-group.js";
export type { DiscoveryCandidate } from "./discovery-candidate.js";
export type { DiscoveryFilters } from "./discovery-filters.js";
export type { DiscoveryReply } from "./discovery-reply.js";
export type { DiscoveryState } from "./discovery-state.js";
export { renderDiscovery } from "./discovery-render.js";

const latestSearches = new WeakMap<
  object,
  Record<string, unknown>
>();

/** Preserves service result order and fields without browser-side fuzzy
 * scoring or reranking.
 */
export class BrowserDiscoveryController {
  private current: DiscoveryState;

  constructor(
    private readonly searchCore: (
      request: Record<string, unknown>,
    ) => Promise<DiscoveryReply>,
    landmarks: readonly BrowserLandmarkGroup[] = [],
  ) {
    this.current = {
      query: "",
      filters: {},
      candidates: [],
      landmarks,
      omittedCount: 0,
      mode: "landmarks",
      areaState: "not_loaded",
    };
  }

  state(): DiscoveryState {
    return this.current;
  }

  private beginSearch(
    query: string,
    filters: DiscoveryFilters,
  ): Record<string, unknown> {
    const request = searchRequest(query, filters);
    latestSearches.set(this, request);
    this.current = {
      ...this.current,
      query,
      filters,
      areaState: "loading",
      error: undefined,
    };
    return request;
  }

  async search(
    query: string,
    filters: DiscoveryFilters = {},
  ): Promise<DiscoveryState> {
    latestSearches.delete(this);
    const normalized = query.trim();
    if (normalized.length === 0) {
      const current = this.current; const landmarks = current.landmarks;
      return (this.current = emptySearchState(current, filters, landmarks));
    }
    const request = this.beginSearch(normalized, filters);
    const next = await loadDiscoverySearch({
      owner: this,
      latestSearches,
      request,
      current: this.current,
      filters,
      searchCore: this.searchCore,
    });
    if (latestSearches.get(this) !== request) return this.current;
    this.current = next;
    return this.current;
  }
}
