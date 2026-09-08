import type { Burst, BurstFileActivity, ReferenceGraph } from "./types.js";
export declare function candidateFinding(input: {
    candidate: BurstFileActivity;
    burst: Burst;
    graph: ReferenceGraph;
    candidatePaths: ReadonlySet<string>;
    threshold: number;
}): import("./types.js").FossilFinding[];
