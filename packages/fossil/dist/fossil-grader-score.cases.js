import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateReferenceSubscores, meetsFossilThreshold, qualifyingBurstCandidates, scoreFossilSubscores, } from "./fossil-grader.js";
import { activity, referenceEdge } from "./fossil-grader.test-support.js";
test("combines all subscores with fixed full-evidence weights", () => {
    const subscores = {
        churn: 0.4,
        abandonment: 0.6,
        referenceWeakness: 0.7,
        clusterIsolation: 0.8,
    };
    assert.deepEqual(scoreFossilSubscores(subscores), {
        score: 0.59,
        basis: "full",
    });
});
test("renormalizes Git subscores without reference signals", () => {
    const subscores = { churn: 0.4, abandonment: 0.6 };
    assert.deepEqual(scoreFossilSubscores(subscores), {
        score: (0.3 / 0.65) * 0.4 + (0.35 / 0.65) * 0.6,
        basis: "git-only",
    });
});
test("includes scores exactly at the configured finding threshold", () => {
    assert.equal(meetsFossilThreshold(0.7, 0.7), true);
    assert.equal(meetsFossilThreshold(0.699_999, 0.7), false);
});
test("retains qualifying evidence for one path in multiple bursts", () => {
    const first = {
        burstId: "burst-1",
        activity: activity("src/reused.ts", 3, 0),
        score: { score: 0.7, basis: "full" },
    };
    const second = {
        burstId: "burst-2",
        activity: activity("src/reused.ts", 8, 2),
        score: { score: 0.8, basis: "git-only" },
    };
    const qualified = qualifyingBurstCandidates([first, second], 0.7);
    assert.deepEqual(qualified, [first, second]);
    assert.notEqual(qualified[0]?.activity, qualified[1]?.activity);
    assert.equal(qualified[0]?.activity.burstCommits, 3);
    assert.equal(qualified[1]?.activity.burstCommits, 8);
});
test("omits both reference subscores when evidence is incomplete", () => {
    const liveEdge = referenceEdge({
        sourcePath: "src/live.ts",
        targetPath: "src/candidate.ts",
        start: 0,
        column: 1,
    });
    const graph = {
        edges: [
            liveEdge,
            referenceEdge({
                sourcePath: "src/candidate.ts",
                targetPath: "src/fossil.ts",
                start: 1,
                column: 2,
            }),
        ],
        unresolved: [],
        complete: false,
        unavailablePaths: ["src/candidate.ts"],
    };
    assert.deepEqual(candidateReferenceSubscores("src/candidate.ts", graph, new Set(["src/fossil.ts"])), {
        available: false,
    });
    assert.deepEqual(candidateReferenceSubscores("src/candidate.ts", { ...graph, complete: true, unavailablePaths: [] }, new Set(["src/fossil.ts"])), { available: true, referenceWeakness: 0.5, clusterIsolation: 0.5 });
});
//# sourceMappingURL=fossil-grader-score.cases.js.map