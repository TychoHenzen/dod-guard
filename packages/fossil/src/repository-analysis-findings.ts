import * as history from "./git-analyzer.js";
import { markUnresolvedCandidateEvidence, regradeVestigialEdges } from "./ref-analyzer.js";
import type { Burst } from "./types.js";
import type { referenceSources } from "./repository-analysis-references.js";
import { candidateFinding } from "./repository-analysis-candidate-finding.js";

function buildBurstReport(
  burst: Burst,
  references: ReturnType<typeof referenceSources>,
  threshold: number,
) {
  const candidates = history.selectFossilCandidates(burst.files);
  const candidatePaths = new Set(candidates.map((candidate) => candidate.path));
  const graph = markUnresolvedCandidateEvidence(
    regradeVestigialEdges(references.graph, candidatePaths),
    candidatePaths,
  );
  const findings = candidates.flatMap((candidate) => candidateFinding({ candidate, burst, graph, candidatePaths, threshold }));
  return {
    id: burst.id,
    startTimestampMs: burst.startTimestampMs,
    endTimestampMs: burst.endTimestampMs,
    commitCount: burst.commits.length,
    fileCount: burst.files.length,
    survivors: history.selectSurvivors(burst.files),
    findings,
    deletedPaths: history.selectDeletedNonSurvivorPaths(burst.files),
  };
}

export function buildBurstReports(
  bursts: readonly Burst[],
  references: ReturnType<typeof referenceSources>,
  threshold: number,
) {
  return bursts.map((burst) => buildBurstReport(burst, references, threshold));
}
