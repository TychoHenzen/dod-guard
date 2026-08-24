import assert from "node:assert/strict";
import { test } from "node:test";
import { renderFossilReportTable } from "./fossil-report-table.js";
test("renders report statistics before optional sections", () => {
    const report = JSON.parse('{"options":{"verbose":false},"statistics":{"includedCommitCount":2,"logicalFileCount":1,"burstCount":0,"candidateFindingCount":0,"uniqueCandidatePathCount":0,"workspaceDebrisCount":0},"bursts":[],"warnings":[],"workspaceDebris":[]}');
    assert.match(renderFossilReportTable(report, { isTty: false }), /^Repository statistics: 2 commits, 1 logical files, 0 bursts/);
});
//# sourceMappingURL=fossil-report-table.test.js.map