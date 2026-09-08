import type { WorkspaceDebrisFinding } from "./types.js";
export declare function finding(path: string, kind: "untracked" | "ignored"): WorkspaceDebrisFinding;
export declare function findingExplanation(candidatePath: string, livePath: string): {
    kind: "finding-explanation";
    createdInBurst: boolean;
    burstCommits: number;
    postBurstCommits: number;
    referenceAvailability: "complete";
    strongInboundReferences: number;
    candidateNeighbors: string[];
    liveNeighbors: string[];
};
