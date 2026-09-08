import { createAdvisoryFossilFinding } from "./fossil-grader.js";
import type { Burst, BurstFileActivity, ReferenceGraph } from "./types.js";
import {
  neighborPaths,
  referenceAvailability,
  scoreSubscores,
  selectedNeighbors,
  strongInboundCount,
} from "./repository-analysis-candidate-scoring.js";

function candidateDetails(input: {
  candidate: BurstFileActivity;
  burst: Burst;
  graph: ReferenceGraph;
  score: NonNullable<ReturnType<typeof scoreSubscores>["score"]>;
  subscores: ReturnType<typeof scoreSubscores>["subscores"];
  referenceAvailable: boolean;
  neighbors: ReadonlySet<string>;
  candidatePaths: ReadonlySet<string>;
}) {
  return {
    burstId: input.burst.id,
    path: input.candidate.path,
    activity: input.candidate,
    score: input.score.score,
    scoreBasis: input.score.basis,
    subscores: input.subscores,
    referenceAvailability: referenceAvailability(input.referenceAvailable),
    ...candidateNeighborDetails(input),
  };
}

function candidateNeighborDetails(input: {
  candidate: BurstFileActivity;
  graph: ReferenceGraph;
  neighbors: ReadonlySet<string>;
  candidatePaths: ReadonlySet<string>;
}) {
  return {
    strongInboundReferences: strongInboundCount(
      input.graph,
      input.candidate.path,
      input.candidatePaths,
    ),
    candidateNeighbors: selectedNeighbors(
      input.neighbors,
      input.candidatePaths,
      true,
    ),
    liveNeighbors: selectedNeighbors(
      input.neighbors,
      input.candidatePaths,
      false,
    ),
  };
}

export function candidateFinding(input: {
  candidate: BurstFileActivity;
  burst: Burst;
  graph: ReferenceGraph;
  candidatePaths: ReadonlySet<string>;
  threshold: number;
}) {
  const scored = scoreSubscores(input);
  const score = scored.score;
  if (!(score && score.score >= input.threshold)) return [];
  const neighbors = neighborPaths(input.graph, input.candidate.path);
  return [
    createAdvisoryFossilFinding(
      candidateDetails({
        ...input,
        score,
        subscores: scored.subscores,
        referenceAvailable: scored.reference.available,
        neighbors,
      }),
    ),
  ];
}
