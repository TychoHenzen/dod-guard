import type { Burst, BurstFileActivity, ReferenceGraph } from "./types.js";
export declare function scoreSubscores(input: {
    candidate: BurstFileActivity;
    burst: Burst;
    graph: ReferenceGraph;
    candidatePaths: ReadonlySet<string>;
}): {
    reference: import("./fossil-grader.js").CandidateReferenceSubscores;
    subscores: {
        churn: number;
        abandonment: number;
    } | {
        referenceWeakness: number;
        clusterIsolation: number;
        churn: number;
        abandonment: number;
    };
    score: import("./fossil-grader.js").FossilScore | undefined;
};
export declare function strongInboundCount(graph: ReferenceGraph, path: string, candidatePaths: ReadonlySet<string>): number;
export declare function neighborPaths(graph: ReferenceGraph, path: string): ReadonlySet<string>;
export declare function selectedNeighbors(neighbors: ReadonlySet<string>, candidatePaths: ReadonlySet<string>, selected: boolean): string[];
export declare function referenceAvailability(available: boolean): "complete" | "unavailable";
