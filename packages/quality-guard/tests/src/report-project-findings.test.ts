import assert from "node:assert/strict";
import { test } from "node:test";
import { buildQualityReport } from "../../src/report-builder.js";

const UNKNOWN_SEVERITY_ERROR = /unknown quality severity: error/;
const SCORE_WITH_ONE_HIGH = 95;
const SCORE_WITHOUT_FINDINGS = 100;

function buildRootEntrypointReport() {
  return buildQualityReport(
    {
      profile: "default",
      files: [
        { path: "src/a.ts", language: "ts", classification: "production" },
      ],
      violations: [
        {
          file: "src/a.ts",
          line: 3,
          rule: "complexity",
          severity: "high",
          message: "12 > 10",
        },
        {
          file: "<repository root>",
          line: 1,
          rule: "test-entrypoint",
          severity: "medium",
          message: "E2: no root test entry point",
        },
        {
          file: "<repository root>",
          line: 1,
          rule: "build-entrypoint",
          severity: "medium",
          message: "E1: no root build entry point",
        },
      ],
    },
    {
      placement: [],
      dependencies: [],
      cycles: [],
      encapsulation: [],
      errors: [],
    },
  );
}

test("reports repository-root findings as unscored project findings", () => {
  const report = buildRootEntrypointReport();

  assert.deepEqual(
    report.projectFindings.map((finding) => [finding.file, finding.rule]),
    [
      ["<repository root>", "build-entrypoint"],
      ["<repository root>", "test-entrypoint"],
    ],
  );
  assert.equal(report.files.length, 1);
  assert.deepEqual(report.summaries.project, {
    findingCount: 2,
    high: 0,
    medium: 2,
    low: 0,
  });
});

test("counts repository-root findings in overall totals only", () => {
  const report = buildRootEntrypointReport();

  assert.equal(report.files[0]?.score, SCORE_WITH_ONE_HIGH);
  assert.deepEqual(report.summaries.overall, {
    fileCount: 1,
    high: 1,
    medium: 2,
    low: 0,
    averageScore: SCORE_WITH_ONE_HIGH,
    minimumScore: SCORE_WITH_ONE_HIGH,
  });
  for (const severity of ["high", "medium", "low"] as const) {
    assert.equal(
      report.summaries.overall[severity],
      report.summaries.production[severity] +
        report.summaries.test[severity] +
        report.summaries.project[severity],
    );
  }
});

test("reports findings outside the scanned files as project findings", () => {
  const report = buildQualityReport(
    {
      profile: "default",
      files: [
        { path: "src/a.ts", language: "ts", classification: "production" },
      ],
      violations: [
        {
          file: "package.json",
          line: 1,
          rule: "build-entrypoint",
          severity: "medium",
          message: "E1: no root build entry point",
        },
      ],
    },
    {
      placement: [],
      dependencies: [],
      cycles: [],
      encapsulation: [],
      errors: [],
    },
  );

  assert.equal(report.projectFindings[0]?.file, "package.json");
  assert.equal(report.files[0]?.findings.length, 0);
  assert.equal(report.files[0]?.score, SCORE_WITHOUT_FINDINGS);
  assert.equal(report.summaries.overall.medium, 1);
});

test("validates severity on repository-root findings", () => {
  assert.throws(
    () =>
      buildQualityReport(
        {
          profile: "default",
          files: [
            { path: "src/a.ts", language: "ts", classification: "production" },
          ],
          violations: [
            {
              file: "<repository root>",
              line: 1,
              rule: "build-entrypoint",
              severity: "error" as never,
              message: "legacy",
            },
          ],
        },
        {
          placement: [],
          dependencies: [],
          cycles: [],
          encapsulation: [],
          errors: [],
        },
      ),
    UNKNOWN_SEVERITY_ERROR,
  );
});
