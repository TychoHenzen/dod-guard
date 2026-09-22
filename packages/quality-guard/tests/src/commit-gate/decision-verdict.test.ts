import assert from "node:assert/strict";
import { test } from "node:test";
import { decideQuality } from "../../../src/commit-gate/decision-core.js";
import {
  growthDecisionInput,
  growthFinding,
} from "./decision-fixtures.test.js";

test("a deterministic failure wins while preserving review findings", () => {
  const result = decideQuality({
    ...growthDecisionInput(),
    hardBounds: [
      {
        severity: "fail",
        affectedPaths: ["src/a.ts"],
        before: {},
        after: {},
        reason: "bound",
      },
    ],
  });
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.findings.length, 2);
  assert.ok(result.findings.some((finding) => finding.severity === "review"));
  assert.ok(result.findings.some((finding) => finding.severity === "fail"));
});

test("accepted review evidence passes deterministic checks", () => {
  const result = decideQuality({
    ...growthDecisionInput(),
    acknowledgements: [growthFinding().id],
  });
  assert.equal(result.verdict, "PASS");
  assert.equal(result.errors.length, 0);
});
