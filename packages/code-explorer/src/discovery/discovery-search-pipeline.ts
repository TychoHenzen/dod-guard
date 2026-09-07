import type {
  ProjectRoot,
  SymbolIdentity,
} from "../semantic/api/public-api.js";
import type { ClassificationConfig } from "./classification-config.js";
import type { DiscoveryFilters } from "./discovery-filters.js";
import type { DiscoveryResult } from "./discovery-result.js";
import {
  allowedCandidates,
  type FileCandidate,
  symbolCandidates,
} from "./discovery-search-candidates.js";
import { matchDiscoveryCandidates } from "./matcher.js";

function resultLimit(filters: DiscoveryFilters): number {
  return Math.max(0, filters.limit ?? 50);
}

export function searchCandidates(
  ...args: [
    root: ProjectRoot,
    config: ClassificationConfig,
    files: readonly FileCandidate[],
    query: string,
    filters: DiscoveryFilters,
    symbols: readonly SymbolIdentity[],
  ]
): DiscoveryResult[] {
  const [root, config, files, query, filters, symbols] = args;
  const semanticCandidates = symbolCandidates(root, config, symbols);
  const allowed = allowedCandidates({
    root,
    filters,
    files,
    symbols: semanticCandidates,
  });
  const classifications = new Map(
    allowed.map((candidate) => [candidate.identity, candidate.classification]),
  );
  return matchDiscoveryCandidates(query, allowed).map((candidate) => {
    const classification = classifications.get(candidate.identity);
    if (!classification) throw new Error("missing discovery classification");
    return { ...candidate, ...classification };
  });
}

export { resultLimit };
