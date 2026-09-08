import type { ReferenceCandidate } from "./reference-candidate.js";

export interface ReferenceSourceContent extends ReferenceCandidate {
  readonly content: string;
}
