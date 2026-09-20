import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeTestQuality } from "../../src/test-quality/analyze.js";
import { evidenceWithSignals } from "./test-quality-fixtures.js";

test("reports T1-T9 only from explicit evidence and keeps language metrics separate", () => {
  const report = analyzeTestQuality(evidenceWithSignals());

  assert.equal(report.status, "ok");
  assert.deepEqual(
    [...new Set(report.findings.map((finding) => finding.heuristic))],
    ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"],
  );
  assert.equal(report.metrics.totals.sourceCount, 4);
  assert.equal(report.metrics.totals.behaviorCount, 7);
  assert.equal(report.metrics.totals.boundaryCount, 2);
  assert.deepEqual(
    report.metrics.languages.map((metric) => metric.language),
    ["csharp", "python", "rust", "typescript"],
  );
  assert.equal(
    report.metrics.coverage.uncovered["src/service.ts:statements"]?.total,
    10,
  );
  assert.equal(report.metrics.timing.overBudgetTestCount, 1);
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.heuristic === "T2" && finding.evidence.status === "unobserved",
    ),
    true,
  );
});

test("does not invent findings when declared evidence covers the behavior", () => {
  const evidence = evidenceWithSignals();
  assert.ok(evidence.coverage);
  assert.ok(evidence.failures);
  assert.ok(evidence.timing);
  evidence.sources[0].behaviors = evidence.sources[0].behaviors.map(
    (behavior) => ({ ...behavior, trivial: false }),
  );
  evidence.tests.push({
    id: "ts.complete.test",
    path: "tests/complete.test.ts",
    language: "ts",
    covers: ["ts.missing", "ts.trivial", "ts.bug"],
    status: "passed",
    durationMs: 10,
    testClass: "unit",
  });
  evidence.tests.push({
    id: "other.complete.test",
    path: "tests/other.test.ts",
    language: "ts",
    covers: ["cs.behavior", "rs.behavior", "py.boundary"],
    status: "passed",
    durationMs: 10,
    testClass: "unit",
  });
  evidence.tests[2].skipReason = {
    kind: "environment",
    detail: "optional runtime unavailable",
  };
  evidence.coverage.observations.push(
    { sourcePath: "src/worker.cs", statements: { covered: 1, total: 1 } },
    { sourcePath: "src/worker.rs", statements: { covered: 1, total: 1 } },
  );
  evidence.failures = [];
  evidence.tests[3].status = "passed";
  evidence.tests[4].status = "passed";
  evidence.timing.budgets[0].maxDurationMs = 200;

  const report = analyzeTestQuality(evidence);
  assert.equal(report.status, "ok");
  assert.deepEqual(report.findings, []);
});

test("does not infer T8 from source-level failure and coverage overlap", () => {
  const evidence = evidenceWithSignals();
  assert.ok(evidence.coverage);
  assert.ok(evidence.failures);
  evidence.coverage.observations[0].uncoveredBehaviorIds = undefined;
  evidence.failures = evidence.failures.map((failure) => ({
    ...failure,
    behaviorId: undefined,
  }));

  const report = analyzeTestQuality(evidence);
  assert.equal(report.status, "ok");
  assert.equal(
    report.findings.some((finding) => finding.heuristic === "T8"),
    false,
  );
});
