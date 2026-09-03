import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readQualityReport } from "../lib/quality-report.mjs";

test("reads the saved quality report without running a scanner", async () => {
  const root = await mkdtemp(join(tmpdir(), "quality-dashboard-"));
  await mkdir(join(root, ".quality"));
  const expected = { schemaVersion: 1, summaries: { overall: { fileCount: 1 } }, files: [] };
  await writeFile(join(root, ".quality", "quality-report.json"), JSON.stringify(expected));
  assert.deepEqual(await readQualityReport(root), expected);
});

test("rejects an unsupported report shape", async () => {
  const root = await mkdtemp(join(tmpdir(), "quality-dashboard-"));
  await mkdir(join(root, ".quality"));
  await writeFile(join(root, ".quality", "quality-report.json"), "{}");
  await assert.rejects(readQualityReport(root), /unsupported shape/);
});
