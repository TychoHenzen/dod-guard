import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { runQualityReport } from "./report.js";

test("runs the scanner and architecture analysis for a project root", () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "quality-report-"));
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "src", "service.ts"),
      'export class Service { run(): string { return "ok"; } }\n',
    );
    const report = runQualityReport({ root, profile: "default" });

    assert.equal(report.schemaVersion, 1);
    assert.deepEqual(
      report.files.map((file) => file.path),
      ["src/service.ts"],
    );
    assert.equal(report.architecture.errors.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
