import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdvisoryFossilFinding } from "./fossil-grader.js";
import { advisoryFindingInput } from "./testing/report-fixtures.js";

test("keeps a maximum-score fossil finding advisory", () => {
  const finding = createAdvisoryFossilFinding(
    advisoryFindingInput({
      burstId: "burst-1",
      path: "src/candidate.ts",
      score: 1,
      burstCommits: 5,
    }),
  );

  assert.equal(finding.score, 1);
  assert.equal(finding.classification, "advisory");
});
