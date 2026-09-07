import type { ProjectRoot } from "../semantic/api/public-api.js";
import type { ClassificationConfig } from "./classification-config.js";
import type { DiscoveryFilters } from "./discovery-filters.js";
import type { DiscoveryPipeline } from "./discovery-pipeline.js";
import type { DiscoveryResult } from "./discovery-result.js";
import type { FileCandidate } from "./discovery-search-candidates.js";
import { resultLimit, searchCandidates } from "./discovery-search-pipeline.js";
import type { DiscoverySearchResponse } from "./discovery-search-response.js";

export function createPipelineSearch(options: {
  root: ProjectRoot;
  config: ClassificationConfig;
  candidates: readonly FileCandidate[];
}): Pick<DiscoveryPipeline, "search" | "searchResult"> {
  const matches = (
    query: string,
    filters: DiscoveryFilters,
    symbols: Parameters<typeof searchCandidates>[5] = [],
  ) =>
    searchCandidates(
      options.root,
      options.config,
      options.candidates,
      query,
      filters,
      symbols,
    );
  const search = (
    query: string,
    filters: DiscoveryFilters,
    symbols: Parameters<typeof searchCandidates>[5] = [],
  ) => matches(query, filters, symbols).slice(0, resultLimit(filters));
  const searchResult = (
    query: string,
    filters: DiscoveryFilters,
    symbols: Parameters<typeof searchCandidates>[5] = [],
  ) => searchPipelineResult(matches, query, filters, symbols);
  return { search, searchResult };
}

function searchPipelineResult(
  matches: (
    query: string,
    filters: DiscoveryFilters,
    symbols?: Parameters<typeof searchCandidates>[5],
  ) => DiscoveryResult[],
  query: string,
  filters: DiscoveryFilters,
  symbols: Parameters<typeof searchCandidates>[5] = [],
): DiscoverySearchResponse {
  const found = matches(query, filters, symbols);
  const limit = resultLimit(filters);
  return {
    candidates: found.slice(0, limit),
    omitted_candidate_count: Math.max(0, found.length - limit),
    applied_filters: { ...filters },
    available_narrowing_filters: [
      "path_globs",
      "languages",
      "kinds",
      "content",
      "include_generated",
    ],
  };
}
