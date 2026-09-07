import type { BrowserLandmarkGroup } from "./browser-landmark-group.js";
import type { DiscoveryCandidate } from "./discovery-candidate.js";
import type { DiscoveryFilters } from "./discovery-filters.js";
import type { DiscoveryReply } from "./discovery-reply.js";
import type { DiscoveryState } from "./discovery-state.js";

export function searchRequest(
  query: string,
  filters: DiscoveryFilters,
): Record<string, unknown> {
  const values = {
    path_globs: copyList(filters.path_globs),
    languages: copyList(filters.languages),
    kinds: copyList(filters.kinds),
    content: filters.content,
    include_generated: filters.include_generated,
  };
  return {
    query,
    ...Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    ),
  };
}

function copyList(
  values: readonly string[] | undefined,
): readonly string[] | undefined {
  if (values === undefined) return undefined;
  return [...values];
}

export function emptySearchState(
  current: DiscoveryState,
  filters: DiscoveryFilters,
  landmarks: readonly BrowserLandmarkGroup[],
): DiscoveryState {
  return {
    ...current,
    query: "",
    filters,
    candidates: [],
    landmarks,
    omittedCount: 0,
    refinementGuidance: undefined,
    mode: "landmarks",
    areaState: "not_loaded",
    error: undefined,
  };
}

export function loadedSearchState(
  current: DiscoveryState,
  reply: DiscoveryReply,
  filters: DiscoveryFilters,
): DiscoveryState {
  const candidates = replyCandidates(reply);
  const omittedCount = replyOmittedCount(reply);
  return {
    ...current,
    filters,
    candidates,
    omittedCount,
    refinementGuidance: reply.data.refinement_guidance,
    mode: "results",
    areaState: candidateAreaState(candidates),
  };
}

function replyCandidates(reply: DiscoveryReply): readonly DiscoveryCandidate[] {
  if (reply.data.candidates) return reply.data.candidates;
  return [];
}

function replyOmittedCount(reply: DiscoveryReply): number {
  if (reply.data.omitted_candidate_count !== undefined)
    return reply.data.omitted_candidate_count;
  return reply.data.omitted_count ?? 0;
}

function candidateAreaState(
  candidates: readonly DiscoveryCandidate[],
): "empty" | "ready" {
  if (candidates.length === 0) return "empty";
  return "ready";
}
