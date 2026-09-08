import assert from "node:assert/strict";
import { test } from "node:test";
import { retainClosedTemporalClusters, retainQualifiedClosedClusters, } from "./git-analyzer.js";
import { exactMinimum, fewerThanFiveCommits, fewerThanThreeLogicalFiles, } from "./git-history-qualification-fixtures.js";
test("drops closed clusters below either qualification minimum", () => {
    assert.deepEqual(retainQualifiedClosedClusters([
        fewerThanFiveCommits,
        fewerThanThreeLogicalFiles,
        exactMinimum,
    ]), [exactMinimum]);
});
test("excludes recent qualifying clusters before closed-cluster qualification", () => {
    const analysisTimestampMs = 10_000;
    const gapMilliseconds = 1_000;
    const clusterEndingAt = (prefix, endTimestampMs) => Array.from({ length: 5 }, (_, index) => ({
        hash: `${prefix}-${index}`,
        committerTimestampMs: endTimestampMs - 4 + index,
        changes: [
            { status: "modified", path: `${prefix}-${index % 3}.ts` },
        ],
    }));
    const recent = clusterEndingAt("recent", analysisTimestampMs - gapMilliseconds + 1);
    const closed = clusterEndingAt("closed", analysisTimestampMs - gapMilliseconds);
    const inactiveClusters = retainClosedTemporalClusters([recent, closed], analysisTimestampMs, gapMilliseconds);
    assert.deepEqual(inactiveClusters, [closed]);
    assert.deepEqual(retainQualifiedClosedClusters(inactiveClusters), [closed]);
});
//# sourceMappingURL=git-history-qualification.cases.js.map