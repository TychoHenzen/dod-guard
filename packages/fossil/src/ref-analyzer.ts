import type { AnalysisWarning, ReferenceGraph, SourceLanguage } from "./types.js";

/** Candidate metadata supplied to a language-specific reference backend. */
export interface ReferenceCandidate {
  readonly path: string;
  readonly language: SourceLanguage;
}

/** The injected synchronous read boundary for eligible current source files. */
export type ReferenceSourceReader = (source: ReferenceCandidate) => string;

/** Source content retained for a later language-specific parser. */
export interface ReferenceSourceContent extends ReferenceCandidate {
  readonly content: string;
}

/** Nonfatal source-read evidence returned before parsing or reference resolution. */
export interface ReferenceReadResult {
  readonly graph: ReferenceGraph;
  readonly sources: readonly ReferenceSourceContent[];
  readonly warnings: readonly AnalysisWarning[];
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

/** Reads eligible sources without letting one unreadable file stop later parsing work. */
export function readReferenceSources(
  sources: readonly ReferenceCandidate[],
  readSource: ReferenceSourceReader,
): ReferenceReadResult {
  const readableSources: ReferenceSourceContent[] = [];
  const unavailablePaths: string[] = [];
  const warnings: AnalysisWarning[] = [];
  for (const source of sources) {
    try {
      readableSources.push({ ...source, content: readSource(source) });
    } catch {
      unavailablePaths.push(source.path);
      warnings.push({
        code: "reference_unreadable",
        message: "Reference source could not be read.",
        path: source.path,
      });
    }
  }
  unavailablePaths.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  warnings.sort((left, right) =>
    (left.path ?? "") < (right.path ?? "") ? -1 : (left.path ?? "") > (right.path ?? "") ? 1 : 0,
  );
  return {
    graph: {
      edges: [],
      unresolved: [],
      complete: unavailablePaths.length === 0,
      unavailablePaths,
    },
    sources: readableSources,
    warnings,
  };
}
