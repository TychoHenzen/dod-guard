import type { RelationCandidate } from "./relation-candidate.js";

export type RelationReply = {
  state: string;
  project_generation?: number;
  data?: { candidates?: readonly RelationCandidate[]; omitted_count?: number };
};
