import assert from "node:assert/strict";
import { test } from "node:test";
import { burstTableRows } from "./output.js";
test("renders burst context and normalized survivors before score-sorted candidates", () => {
    const burst = {
        id: "burst-1",
        startTimestampMs: Date.UTC(2025, 0, 2),
        endTimestampMs: Date.UTC(2025, 0, 5),
        commitCount: 8,
        fileCount: 4,
        survivors: [
            {
                identity: "z",
                path: "src\\zeta.ts",
                burstCommits: 1,
                postBurstCommits: 0,
                createdInBurst: true,
                existsAtHead: true,
            },
            {
                identity: "a",
                path: "./src/alpha.ts",
                burstCommits: 1,
                postBurstCommits: 0,
                createdInBurst: true,
                existsAtHead: true,
            },
        ],
        findings: [
            {
                classification: "advisory",
                burstId: "burst-1",
                path: "src/low.ts",
                activity: {
                    identity: "low",
                    path: "src/low.ts",
                    burstCommits: 1,
                    postBurstCommits: 0,
                    createdInBurst: true,
                    existsAtHead: true,
                },
                score: 0.4,
                scoreBasis: "git-only",
                subscores: { churn: 0.1, abandonment: 1 },
                referenceAvailability: "unavailable",
                strongInboundReferences: 0,
                candidateNeighbors: [],
                liveNeighbors: [],
            },
            {
                classification: "advisory",
                burstId: "burst-1",
                path: "src\\high.ts",
                activity: {
                    identity: "high",
                    path: "src/high.ts",
                    burstCommits: 2,
                    postBurstCommits: 0,
                    createdInBurst: true,
                    existsAtHead: true,
                },
                score: 0.8,
                scoreBasis: "full",
                subscores: { churn: 0.2, abandonment: 1, referenceWeakness: 1, clusterIsolation: 1 },
                referenceAvailability: "complete",
                strongInboundReferences: 0,
                candidateNeighbors: [],
                liveNeighbors: [],
            },
        ],
        deletedPaths: [],
    };
    const newerRows = burstTableRows([burst]);
    assert.deepEqual(newerRows, [
        { kind: "burst", id: "burst-1", startDate: "2025-01-02", endDate: "2025-01-05", commitCount: 8, fileCount: 4 },
        { kind: "survivor", path: "src/alpha.ts" },
        { kind: "survivor", path: "src/zeta.ts" },
        { kind: "finding", path: "src/high.ts", score: 0.8, scoreBasis: "full" },
        { kind: "finding", path: "src/low.ts", score: 0.4, scoreBasis: "git-only" },
    ]);
    const olderBurst = {
        ...burst,
        id: "burst-older",
        startTimestampMs: Date.UTC(2024, 11, 1),
        endTimestampMs: Date.UTC(2024, 11, 3),
        survivors: [burst.survivors[1]],
        findings: [{ ...burst.findings[0], burstId: "burst-older" }],
    };
    const olderRows = burstTableRows([olderBurst]);
    assert.deepEqual(burstTableRows([olderBurst, burst]), [...newerRows, ...olderRows]);
});
//# sourceMappingURL=output-burst.cases.js.map