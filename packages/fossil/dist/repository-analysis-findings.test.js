import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBurstReports } from "./repository-analysis-findings.js";
test("builds a report boundary for each analyzed burst", () => {
    const burst = {
        id: "burst-1",
        startTimestampMs: 0,
        endTimestampMs: 1,
        commits: [],
        files: [],
        closed: true,
    };
    const references = {
        sources: [],
        warnings: [],
        acceptedBytes: 0,
        graph: {
            edges: [],
            unresolved: [],
            complete: true,
            unavailablePaths: [],
        },
    };
    const [report] = buildBurstReports([burst], references, 0.4);
    assert.equal(report?.id, "burst-1");
    assert.deepEqual(report?.findings, []);
});
//# sourceMappingURL=repository-analysis-findings.test.js.map