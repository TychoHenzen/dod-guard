import type { DiscoveryCandidate } from "./discovery-candidate.js";

export type CandidateName = {
  candidate: DiscoveryCandidate;
  values: readonly string[];
};
