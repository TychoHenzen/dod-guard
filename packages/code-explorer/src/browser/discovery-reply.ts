import type { DiscoveryCandidate } from "./discovery-candidate.js";

export type DiscoveryReply = {
  data: {
    candidates?: readonly DiscoveryCandidate[];
    omitted_count?: number;
    omitted_candidate_count?: number;
    refinement_guidance?: string;
  };
};
