import type { CandidateName } from "./candidate-name.js";
import type { DiscoveryCandidate } from "./discovery-candidate.js";
import type { DiscoveryMatch } from "./discovery-match.js";
import {
  classify,
  compareEvidence,
  compareMatches,
} from "./matcher-ranking.js";
import { normalizeCandidate, normalizeValue } from "./matcher-normalize.js";

export type { DiscoveryCandidate } from "./discovery-candidate.js";
export type { DiscoveryMatch } from "./discovery-match.js";
export type { MatchClass } from "./match-class.js";

/** Matches a non-empty query using Unicode-normalized visible discovery
 * evidence.
 */
export function matchDiscoveryCandidates(
  query: string,
  candidates: readonly DiscoveryCandidate[],
): DiscoveryMatch[] {
  const normalizedQuery = normalizeDiscoveryQuery(query);
  if (normalizedQuery.length === 0) return [];
  return candidates
    .map((candidate) => matchCandidate(normalizedQuery, candidate))
    .filter((candidate): candidate is DiscoveryMatch => candidate !== undefined)
    .sort(compareMatches);
}

/** Normalizes client input once so blank searches can take the landmark-only
 * path.
 */
export function normalizeDiscoveryQuery(value: string): string {
  return normalizeValue(value).trim();
}

function matchCandidate(
  query: string,
  candidate: DiscoveryCandidate,
): DiscoveryMatch | undefined {
  const normalized = normalizeCandidate(candidate);
  if (normalized === undefined) return undefined;
  const evidence = bestEvidence(query, normalized);
  return evidence === undefined
    ? undefined
    : { ...normalized.candidate, ...evidence };
}

function bestEvidence(query: string, normalized: CandidateName) {
  return normalized.values
    .map((value) => classify(query, value))
    .filter(
      (match): match is NonNullable<ReturnType<typeof classify>> =>
        match !== undefined,
    )
    .sort(compareEvidence)[0];
}
