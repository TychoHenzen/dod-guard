// Proves the shipped dist/bundle.js test-quality command reports findings on
// the shared high/medium/low scale and still rejects invalid evidence.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const bundle = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "dist",
  "bundle.js",
);

const FINDINGS_EVIDENCE = {
  schemaVersion: 1,
  sources: [
    {
      path: "src/a.ts",
      language: "ts",
      behaviors: [{ id: "a.behavior", kind: "behavior" }],
    },
  ],
  tests: [],
};

const INVALID_EVIDENCE = {
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
};

let root;

before(() => {
  root = mkdtempSync(join(tmpdir(), "quality-guard-bundle-test-quality-"));
  writeFileSync(join(root, "findings.json"), JSON.stringify(FINDINGS_EVIDENCE));
  writeFileSync(join(root, "invalid.json"), JSON.stringify(INVALID_EVIDENCE));
});

after(() => {
  if (root !== undefined) {
    rmSync(root, { recursive: true, force: true });
  }
});

function runTestQuality(evidence) {
  const result = spawnSync(
    process.execPath,
    [bundle, "test-quality", `--root=${root}`, `--evidence=${evidence}`],
    { cwd: root, encoding: "utf8" },
  );
  return { status: result.status, report: JSON.parse(result.stdout) };
}

test("bundle test-quality findings all carry medium severity", () => {
  const { status, report } = runTestQuality("findings.json");
  assert.equal(status, 0);
  assert.equal(report.status, "ok");
  assert.ok(report.findings.length > 0, "the fixture produced no findings");
  assert.deepEqual(
    [...new Set(report.findings.map((finding) => finding.severity))],
    ["medium"],
  );
  assert.equal(
    report.findings.some((finding) => finding.severity === "review"),
    false,
  );
});

test("bundle test-quality still exits 3 with no findings on invalid evidence", () => {
  const { status, report } = runTestQuality("invalid.json");
  assert.equal(status, 3);
  assert.equal(report.status, "invalid");
  assert.deepEqual(report.findings, []);
});
