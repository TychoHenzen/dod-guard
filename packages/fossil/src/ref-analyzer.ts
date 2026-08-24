import type { ReferenceGraph, SourceLanguage } from "./types.js";

/** Candidate metadata supplied to a language-specific reference backend. */
export interface ReferenceCandidate {
  readonly path: string;
  readonly language: SourceLanguage;
}

/** Produces normalized unavailable evidence for candidates with no reference backend. */
export function unsupportedCandidateReferenceGraph(candidates: readonly ReferenceCandidate[]): ReferenceGraph {
  const unavailablePaths = [
    ...new Set(
      candidates.filter((candidate) => candidate.language === "unsupported").map((candidate) => candidate.path),
    ),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return {
    edges: [],
    unresolved: [],
    complete: unavailablePaths.length === 0,
    unavailablePaths,
  };
}
