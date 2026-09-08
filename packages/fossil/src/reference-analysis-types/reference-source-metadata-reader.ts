import type { ReferenceCandidate } from "./reference-candidate.js";

export type ReferenceSourceMetadataReader = (source: ReferenceCandidate) => {
  readonly byteLength: number;
};
