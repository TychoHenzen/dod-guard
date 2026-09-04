import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createQualityReportRefresher, readQualityReport } from "../lib/quality-report.mjs";

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

test("refreshes the current project through the quality-guard report command", async () => {
  const root = await mkdtemp(join(tmpdir(), "quality-dashboard-"));
  const expected = { schemaVersion: 1, summaries: { overall: { fileCount: 2 } }, files: [], architecture: {} };
  let command;
  const refresh = createQualityReportRefresher({
    bundlePath: "quality-guard-bundle.js",
    run: async (...args) => {
      command = args;
      return { stdout: JSON.stringify(expected) };
    },
  });

  assert.deepEqual(await refresh(root), expected);
  assert.deepEqual(command[1], ["quality-guard-bundle.js", "report", `--root=${root}`]);
  assert.deepEqual(JSON.parse(await readFile(join(root, ".quality", "quality-report.json"), "utf8")), expected);
});
