import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyHistoryWarnings, futureCommitWarnings, parseNonMergeGitLog, retainClosedTemporalClusters, shallowHistoryWarnings, shallowRepositoryArguments, sparseCheckoutArguments, sparseCheckoutWarnings, splitAtChangePoint, splitTemporalClusters, } from "./git-analyzer.js";
test("reports future commits and leaves their temporal cluster unfinished", () => {
    const analysisTimestampMs = 10_000;
    const cluster = [
        { hash: "past", committerTimestampMs: 8_000, changes: [{ status: "modified", path: "past.ts" }] },
        {
            hash: "z-future",
            committerTimestampMs: 10_001,
            changes: [{ status: "modified", path: "future-z.ts" }],
        },
        {
            hash: "a-future",
            committerTimestampMs: 10_001,
            changes: [{ status: "modified", path: "future-a.ts" }],
        },
        { hash: "later", committerTimestampMs: 8_002, changes: [{ status: "modified", path: "later.ts" }] },
        { hash: "latest", committerTimestampMs: 8_003, changes: [{ status: "modified", path: "latest.ts" }] },
    ];
    assert.deepEqual(futureCommitWarnings(cluster, analysisTimestampMs), [
        { code: "future_commit", message: "Commit a-future has a committer timestamp after analysis time." },
        { code: "future_commit", message: "Commit z-future has a committer timestamp after analysis time." },
    ]);
    assert.deepEqual(retainClosedTemporalClusters([cluster], analysisTimestampMs, 1_000), []);
});
test("reports shallow history without treating malformed Git output as complete", () => {
    assert.deepEqual(shallowRepositoryArguments(), ["rev-parse", "--is-shallow-repository"]);
    assert.deepEqual(shallowHistoryWarnings("true\n"), [
        {
            code: "shallow_history",
            message: "Repository is shallow; burst and consolidation history may be incomplete.",
        },
    ]);
    assert.deepEqual(shallowHistoryWarnings("false\r\n"), []);
    assert.throws(() => shallowHistoryWarnings("unknown\n"), /Unexpected Git shallow-repository response/);
});
test("reports sparse checkout without treating malformed Git output as complete", () => {
    assert.deepEqual(sparseCheckoutArguments(), ["config", "--bool", "--get", "core.sparseCheckout"]);
    assert.deepEqual(sparseCheckoutWarnings("true\n"), [
        {
            code: "sparse_checkout",
            message: "Sparse checkout is enabled; current-file existence and references may be incomplete.",
        },
    ]);
    assert.deepEqual(sparseCheckoutWarnings("false\r\n"), []);
    assert.deepEqual(sparseCheckoutWarnings(""), []);
    assert.throws(() => sparseCheckoutWarnings("enabled\n"), /Unexpected Git sparse-checkout response/);
});
test("returns empty history evidence and no burst clusters for an empty repository", () => {
    const history = parseNonMergeGitLog("");
    const nonemptyHistory = [{ hash: "commit", committerTimestampMs: 1_000, changes: [] }];
    const temporalClusters = splitTemporalClusters(history, 1_000);
    assert.deepEqual(emptyHistoryWarnings(history), [
        { code: "empty_repository", message: "Repository has no commits; burst and consolidation history is unavailable." },
    ]);
    assert.deepEqual(emptyHistoryWarnings(nonemptyHistory), []);
    assert.deepEqual(temporalClusters, []);
    assert.deepEqual(splitAtChangePoint(history), []);
    assert.deepEqual(retainClosedTemporalClusters(temporalClusters, 10_000, 1_000), []);
});
//# sourceMappingURL=git-history-warnings.cases.js.map