import assert from "node:assert/strict";
import { test } from "node:test";
import * as gitAnalyzer from "./git-analyzer.js";
test("reports shallow history without treating malformed " +
    "Git output as complete", () => {
    assert.deepEqual(gitAnalyzer.shallowRepositoryArguments(), [
        "rev-parse",
        "--is-shallow-repository",
    ]);
    assert.deepEqual(gitAnalyzer.shallowHistoryWarnings("true\n"), [
        {
            code: "shallow_history",
            message: "Repository is shallow; burst and consolidation history may be " +
                "incomplete.",
        },
    ]);
    assert.deepEqual(gitAnalyzer.shallowHistoryWarnings("false\r\n"), []);
    assert.throws(() => gitAnalyzer.shallowHistoryWarnings("unknown\n"), /Unexpected Git shallow-repository response/);
});
test("reports sparse checkout without treating malformed " +
    "Git output as complete", () => {
    assert.deepEqual(gitAnalyzer.sparseCheckoutArguments(), [
        "config",
        "--bool",
        "--get",
        "core.sparseCheckout",
    ]);
    assert.deepEqual(gitAnalyzer.sparseCheckoutWarnings("true\n"), [
        {
            code: "sparse_checkout",
            message: "Sparse checkout is enabled; current-file existence and references " +
                "may be incomplete.",
        },
    ]);
    assert.deepEqual(gitAnalyzer.sparseCheckoutWarnings("false\r\n"), []);
    assert.deepEqual(gitAnalyzer.sparseCheckoutWarnings(""), []);
    assert.throws(() => gitAnalyzer.sparseCheckoutWarnings("enabled\n"), /Unexpected Git sparse-checkout response/);
});
test("returns empty history evidence and no burst clusters for an empty " +
    "repository", () => {
    const history = gitAnalyzer.parseNonMergeGitLog("");
    const nonemptyHistory = [
        { hash: "commit", committerTimestampMs: 1_000, changes: [] },
    ];
    const temporalClusters = gitAnalyzer.splitTemporalClusters(history, 1_000);
    assert.deepEqual(gitAnalyzer.emptyHistoryWarnings(history), [
        {
            code: "empty_repository",
            message: "Repository has no commits; burst and consolidation history is " +
                "unavailable.",
        },
    ]);
    assert.deepEqual(gitAnalyzer.emptyHistoryWarnings(nonemptyHistory), []);
    assert.deepEqual(temporalClusters, []);
    assert.deepEqual(gitAnalyzer.splitAtChangePoint(history), []);
    assert.deepEqual(gitAnalyzer.retainClosedTemporalClusters(temporalClusters, 10_000, 1_000), []);
});
//# sourceMappingURL=git-history-warnings-more.cases.js.map