import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { analyzeTestQuality } from "../../src/test-quality/analyze.js";
import { runTestQualityReport } from "../../src/test-quality/report.js";

test("rejects ambiguous references instead of treating malformed evidence as zero coverage", () => {
  const report = analyzeTestQuality({
    schemaVersion: 1,
    sources: [
      {
        path: "src/a.py",
        language: "python",
        behaviors: [{ id: "a", kind: "behavior" }],
      },
    ],
    tests: [
      {
        id: "a.test",
        path: "tests/a_test.py",
        language: "python",
        covers: ["missing"],
        status: "skipped",
      },
    ],
  });

  assert.equal(report.status, "invalid");
  assert.equal(report.findings.length, 0);
  assert.equal(
    report.errors.some((error) => error.includes("skipReason")),
    true,
  );
  const unknown = analyzeTestQuality({
    schemaVersion: 1,
    sources: [{ path: "src/a.py", language: "python", behaviors: [] }],
    tests: [
      {
        id: "a.test",
        path: "tests/a_test.py",
        language: "python",
        covers: ["missing"],
        status: "passed",
      },
    ],
  });
  assert.equal(
    unknown.errors.some((error) => error.includes("unknown behavior")),
    true,
  );
});

test("returns a quiet unavailable result when a project has no evidence file", () => {
  const root = mkdtempSync(path.join(tmpdir(), "quality-test-quality-"));
  try {
    mkdirSync(path.join(root, ".quality"));
    const report = runTestQualityReport({ root });
    assert.equal(report.status, "ok");
    assert.equal(
      report.evidencePath,
      path.join(".quality", "test-quality.json"),
    );
    assert.match(report.errors[0] ?? "", /evidence file not found/);
    assert.deepEqual(report.findings, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loads an evidence file relative to the requested root", () => {
  const root = mkdtempSync(path.join(tmpdir(), "quality-test-quality-file-"));
  try {
    mkdirSync(path.join(root, ".quality"));
    writeFileSync(
      path.join(root, ".quality", "test-quality.json"),
      JSON.stringify({
        schemaVersion: 1,
        sources: [],
        tests: [],
        coverage: { provider: "none", observations: [] },
      }),
    );
    const report = runTestQualityReport({ root });
    assert.equal(report.status, "ok");
    assert.deepEqual(report.findings, []);
    assert.deepEqual(report.metrics.languages, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
