import assert from "node:assert/strict";
import { test } from "node:test";
import { buildQualityReport } from "../../src/report-builder.js";

const UNKNOWN_SEVERITY_ERROR = /unknown quality severity: error/;

test("scores files and excludes architecture from score", () => {
  const report = buildQualityReport(
    {
      profile: "default",
      files: [
        { path: "src/clean.ts", language: "ts", classification: "production" },
        { path: "tests/noisy.test.ts", language: "ts", classification: "test" },
      ],
      violations: [
        {
          file: "tests/noisy.test.ts",
          line: 4,
          rule: "complexity",
          severity: "high",
          message: "12 > 10",
        },
        {
          file: "tests/noisy.test.ts",
          line: 8,
          rule: "else-branch",
          severity: "medium",
          message: "prefer guard",
        },
        {
          file: "tests/noisy.test.ts",
          line: 9,
          rule: "todo-marker",
          severity: "medium",
          message: "TODO",
        },
      ],
    },
    {
      placement: [{ kind: "generic-bucket", directory: "src/utils" }],
      dependencies: [],
      cycles: [],
      encapsulation: [],
      errors: [],
    },
  );

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.scanner.profile, "advisory");
  assert.deepEqual(
    report.files.map((file) => [file.path, file.classification, file.score]),
    [
      ["src/clean.ts", "production", 100],
      ["tests/noisy.test.ts", "test", 93],
    ],
  );
  assert.deepEqual(
    report.files[1]?.findings.map((finding) => finding.severity),
    ["high", "medium", "medium"],
  );
  assert.deepEqual(report.summaries.test, {
    fileCount: 1,
    high: 1,
    medium: 2,
    low: 0,
    averageScore: 93,
    minimumScore: 93,
  });
  assert.equal(report.summaries.production.minimumScore, 100);
  assert.equal(report.summaries.test.averageScore, 93);
  assert.deepEqual(report.projectFindings, []);
  assert.deepEqual(report.summaries.project, {
    findingCount: 0,
    high: 0,
    medium: 0,
    low: 0,
  });
  assert.equal(report.architecture.placement.length, 1);
  assert.deepEqual(report.scoring, {
    initial: 100,
    highDeduction: 5,
    mediumDeduction: 1,
    lowDeduction: 0,
    minimum: 0,
  });
  assert.deepEqual(Object.keys(report.files[1] ?? {}).sort(), [
    "classification",
    "findings",
    "high",
    "language",
    "low",
    "medium",
    "path",
    "score",
  ]);
});

test("scores stop at zero and findings have deterministic order", () => {
  const violations = Array.from({ length: 21 }, (_, index) => ({
    file: "src/bad.ts",
    line: 21 - index,
    rule: "complexity",
    severity: "high" as const,
    message: "too complex",
  }));
  const report = buildQualityReport(
    {
      profile: "strict",
      files: [
        { path: "src/bad.ts", language: "ts", classification: "production" },
      ],
      violations,
    },
    {
      placement: [],
      dependencies: [],
      cycles: [],
      encapsulation: [],
      errors: [],
    },
  );

  assert.equal(report.files[0]?.score, 0);
  assert.equal(report.scanner.profile, "advisory");
  assert.equal(report.files[0]?.high, 21);
  assert.deepEqual(
    report.files[0]?.findings.slice(0, 2).map((finding) => finding.line),
    [1, 2],
  );
});

test("rejects scanner findings outside the high/medium/low vocabulary", () => {
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
              file: "src/a.ts",
              line: 1,
              rule: "complexity",
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

test("reports repository-root findings as unscored project findings", () => {
  const report = buildQualityReport(
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

  assert.deepEqual(
    report.projectFindings.map((finding) => [finding.file, finding.rule]),
    [
      ["<repository root>", "build-entrypoint"],
      ["<repository root>", "test-entrypoint"],
    ],
  );
  assert.equal(report.files.length, 1);
  assert.equal(report.files[0]?.score, 95);
  assert.deepEqual(report.summaries.overall, {
    fileCount: 1,
    high: 1,
    medium: 2,
    low: 0,
    averageScore: 95,
    minimumScore: 95,
  });
  assert.deepEqual(report.summaries.project, {
    findingCount: 2,
    high: 0,
    medium: 2,
    low: 0,
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
  assert.equal(report.files[0]?.score, 100);
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
