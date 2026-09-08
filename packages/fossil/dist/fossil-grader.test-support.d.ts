import type { BurstFileActivity, ReferenceGraph } from "./types.js";
export declare function activity(path: string, burstCommits: number, postBurstCommits?: number): BurstFileActivity;
export declare function referenceEdge(input: {
    sourcePath: string;
    targetPath: string;
    start: number;
    column: number;
    kind?: ReferenceGraph["edges"][number]["kind"];
    strength?: ReferenceGraph["edges"][number]["strength"];
}): ReferenceGraph["edges"][number];
