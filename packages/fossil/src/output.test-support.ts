import type { WorkspaceDebrisFinding } from "./types.js";

export function finding(path: string, kind: "untracked" | "ignored"): WorkspaceDebrisFinding {
  return {
    classification: "advisory",
    review: "possible workspace debris",
    path,
    kind,
    modifiedTimestampMs: 0,
    ageSource: "mtime",
    ageUncertainty: "mtime only",
    detectedReferenceEvidence: [],
    analysisBoundary: "C:/repo",
    unobservedReferenceMechanisms: [],
  };
}

export function findingExplanation(candidatePath: string, livePath: string) {
  return {
    kind: "finding-explanation" as const,
    createdInBurst: true,
    burstCommits: 2,
    postBurstCommits: 0,
    referenceAvailability: "complete" as const,
    strongInboundReferences: 1,
    candidateNeighbors: [candidatePath],
    liveNeighbors: [livePath],
  };
}
