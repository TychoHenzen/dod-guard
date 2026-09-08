export type BurstTableRow = {
    readonly kind: "burst";
    readonly id: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly commitCount: number;
    readonly fileCount: number;
} | {
    readonly kind: "survivor";
    readonly path: string;
} | {
    readonly kind: "finding";
    readonly path: string;
    readonly score: number;
    readonly scoreBasis: "full" | "git-only";
} | {
    readonly kind: "finding-explanation";
    readonly createdInBurst: boolean;
    readonly burstCommits: number;
    readonly postBurstCommits: number;
    readonly referenceAvailability: "complete" | "unavailable";
    readonly strongInboundReferences: number;
    readonly candidateNeighbors: readonly string[];
    readonly liveNeighbors: readonly string[];
};
