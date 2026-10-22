import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { fixture, SAMPLE_GITHUB_TOKEN } from "./fixtures/inspector-fixtures.mjs";

const execFileAsync = promisify(execFile);
const inspectorPath = fileURLToPath(new URL("./inspect-repository.mjs", import.meta.url));

async function runInspector(...args) {
  return execFileAsync(process.execPath, [inspectorPath, ...args], { windowsHide: true });
}

async function assertInspectorUsage(args, expected) {
  await assert.rejects(runInspector(...args), (error) => {
    assert.match(error.stderr, expected);
    return true;
  });
}

async function seedCliProject(root) {
  await writeFile(path.join(root, "index.ts"), "export const answer = 42;\n");
  await writeFile(path.join(root, ".env"), "TOKEN=secret\n");
  await writeFile(path.join(root, "config.txt"), `${SAMPLE_GITHUB_TOKEN}\n`);
}

async function assertBoundedSummaryMode(root) {
  const summaryOutput = await runInspector("--summary", root);
  const summary = JSON.parse(summaryOutput.stdout);
  assert.deepEqual(summary.counts, {
    files: 3,
    manifests: 0,
    configurations: 0,
    instructions: 0,
    sourceExtensions: 2,
    languages: 1,
    unclassifiedExtensions: 0,
    credentialFindings: 2,
  });
  assert.ok(summaryOutput.stdout.length < 500);
  assert.doesNotMatch(summaryOutput.stdout, new RegExp(SAMPLE_GITHUB_TOKEN));
  assert.equal("files" in summary, false);
  assert.equal("credentialFindings" in summary, false);
}

async function assertDetailedMode(root) {
  const full = JSON.parse((await runInspector(root)).stdout);
  assert.deepEqual(full.files, [".env", "config.txt", "index.ts"]);
  assert.deepEqual(full.credentialFindings, [
    { file: ".env", line: null, signal: "secret-like-filename" },
    { file: "config.txt", line: 1, signal: "github-token" },
  ]);
}

async function assertSnapshotMode(root) {
  const snapshotPath = path.join(root, "snapshot.json");
  await writeFile(
    snapshotPath,
    JSON.stringify({
      projects: [{ closed: false, statusOptions: ["Backlog", "Todo", "In Progress", "Done"] }],
      checks: [{ name: "test", conclusion: "SUCCESS" }],
    }),
  );
  const snapshot = JSON.parse((await runInspector("--github-snapshot", snapshotPath)).stdout);
  assert.equal(snapshot.readyForProtection, true);
  assert.deepEqual(snapshot.requiredChecks, ["test"]);
}

test("summary CLI stays bounded while the default and snapshot modes remain detailed", async (t) => {
  const root = await fixture(t, "cli");
  await seedCliProject(root);
  await assertBoundedSummaryMode(root);
  await assertDetailedMode(root);
  await assertSnapshotMode(root);
});

test("keeps summary output bounded as the inventory grows", async (t) => {
  const root = await fixture(t, "summary-bound");
  await Promise.all(
    Array.from({ length: 400 }, (_, index) => writeFile(path.join(root, `file-${index}.ts`), "export {}\n")),
  );

  const output = await runInspector("--summary", root);
  const summary = JSON.parse(output.stdout);

  assert.equal(summary.counts.files, 400);
  assert.ok(output.stdout.length < 500);
});

test("rejects malformed summary arguments", async () => {
  await assertInspectorUsage(["--summary"], /Usage: inspect-repository\.mjs --summary <project-root>/);
  await assertInspectorUsage(["--summary", "one", "two"], /Usage: inspect-repository\.mjs --summary <project-root>/);
  await assertInspectorUsage(["project", "--summary"], /Usage: inspect-repository\.mjs \[project-root\]/);
});

test("rejects malformed GitHub snapshot arguments", async () => {
  const usage = /Usage: inspect-repository\.mjs --github-snapshot <snapshot\.json>/;

  await assertInspectorUsage(["--github-snapshot"], usage);
  await assertInspectorUsage(["--github-snapshot", "snapshot.json", "extra"], usage);
  await assertInspectorUsage(["snapshot.json", "--github-snapshot"], usage);
});

test("reports a thrown error on stderr alone and exits with code 1", async (t) => {
  const root = await fixture(t, "exit-code");

  await assert.rejects(runInspector("--summary", path.join(root, "missing")), (error) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, "");
    assert.equal(error.stderr, "Project root is not a directory\n");
    return true;
  });
});
