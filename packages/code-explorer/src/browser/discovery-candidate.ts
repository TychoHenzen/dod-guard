import type { DiscoveryCandidateMatch } from "./discovery-candidate-match.js";

export type DiscoveryCandidate =
  | (DiscoveryCandidateMatch & { type: "file" })
  | (DiscoveryCandidateMatch & { type: "symbol"; name: string; kind: string });
