import type { DiscoveryCandidate } from "./discovery-candidate.js";
import type { MatchClass } from "./match-class.js";

export type DiscoveryMatch = DiscoveryCandidate & {
  match_class: MatchClass;
  match_score: number;
};
