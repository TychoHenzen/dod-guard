// Proves the shipped dist/bundle.js honors the report contract. The test runs
// the bundle on a fixture, so it checks the artifact users run, not the source.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const bundle = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "dist",
  "bundle.js",
);
const SEVERITIES = ["high", "medium", "low"];
const SUMMARY_KEYS = ["overall", "production", "test", "project"];
// architecture is left out: its errors lists extraction failures, not severity counts.
const SEVERITY_SECTIONS = [
  "summaries",
  "files",
  "projectFindings",
  "scanner",
  "scoring",
];

let fixture;
let report;

before(() => {
  fixture = mkdtempSync(join(tmpdir(), "quality-guard-bundle-report-"));
  mkdirSync(join(fixture, "src"));
  writeFileSync(
    join(fixture, "src", "a.ts"),
    "export function f(a){\n if(a){return 1}else{return 2}\n}\n",
  );
  const stdout = execFileSync(
    process.execPath,
    [bundle, "report", `--root=${fixture}`],
    { cwd: fixture, encoding: "utf8" },
  );
  report = JSON.parse(stdout);
});

after(() => {
  if (fixture !== undefined) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

function fileFindings() {
  return report.files.flatMap((file) => file.findings);
}

function severityProblems(label, findings) {
  return findings.flatMap((finding, index) => {
    if (SEVERITIES.includes(finding.severity)) {
      return [];
    }
    const shown = JSON.stringify(finding.severity);
    return [`${label}[${index}].severity is ${shown}`];
  });
}

function legacyKeyPaths(value, path) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      legacyKeyPaths(item, `${path}[${index}]`),
    );
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const nested = legacyKeyPaths(child, childPath);
    if (key === "errors" || key === "warnings") {
      return [childPath, ...nested];
    }
    return nested;
  });
}

test("bundle report declares schemaVersion 2", () => {
  assert.equal(report.schemaVersion, 2);
});

test("bundle report lists files with findings", () => {
  assert.ok(Array.isArray(report.files), "files is not an array");
  assert.ok(report.files.length > 0, "files has no entries");
  assert.ok(fileFindings().length > 0, "no file findings were reported");
});

test("bundle report lists project findings", () => {
  assert.ok(
    Array.isArray(report.projectFindings),
    "projectFindings is not an array",
  );
  assert.ok(
    report.projectFindings.length > 0,
    "projectFindings has no entries",
  );
});

test("every bundle finding has a high, medium, or low severity", () => {
  const problems = [
    ...report.files.flatMap((file, index) =>
      severityProblems(`files[${index}].findings`, file.findings),
    ),
    ...severityProblems("projectFindings", report.projectFindings),
  ];
  assert.deepEqual(problems, []);
});

test("bundle report has high and medium file findings", () => {
  const severities = new Set(fileFindings().map((finding) => finding.severity));
  assert.ok(severities.has("high"), "no high file finding was reported");
  assert.ok(severities.has("medium"), "no medium file finding was reported");
});

test("each summary has numeric high, medium, and low counts", () => {
  for (const key of SUMMARY_KEYS) {
    const summary = report.summaries?.[key];
    assert.ok(
      summary && typeof summary === "object",
      `summaries.${key} is missing`,
    );
    for (const severity of SEVERITIES) {
      assert.ok(
        Number.isFinite(summary[severity]),
        `summaries.${key}.${severity} is ${JSON.stringify(summary[severity])}`,
      );
    }
  }
});

test("severity-bearing report sections have no errors or warnings keys", () => {
  const topLevel = ["errors", "warnings"]
    .filter((key) => Object.hasOwn(report, key))
    .map((key) => `report.${key}`);
  const nested = SEVERITY_SECTIONS.flatMap((key) =>
    legacyKeyPaths(report[key], `report.${key}`),
  );
  const found = [...topLevel, ...nested];
  assert.deepEqual(found, [], `legacy keys found: ${found.join(", ")}`);
});

test("scanner and scoring blocks have no profile key", () => {
  for (const key of ["scanner", "scoring"]) {
    const block = report[key];
    assert.ok(
      block && typeof block === "object",
      `report.${key} is not an object`,
    );
    assert.equal(
      Object.hasOwn(block, "profile"),
      false,
      `report.${key} has a profile key`,
    );
  }
});
