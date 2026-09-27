// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawn } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { dispatchReviewers, REVIEWERS, WINDOWS_REVIEWER_CONCURRENCY } from "./review-dispatch.mjs";

const REVIEW_SCHEMA_PATH = join(process.cwd(), "plugins", "dod-guard", "skills", "review-pr", "response-schema.json");
const WRAPPER_PATTERN = /(?:powershell|pwsh|run-reviewer\.ps1|-File)/iu;
const INVALID_SCHEMA_PATTERN = /invalid_json_schema/u;
// biome-ignore lint/style/noProcessEnv: The opt-in smoke test is configured by the invoking test command.
const RUN_LIVE_SCHEMA_SMOKE = process.env.CODEX_REVIEW_SCHEMA_SMOKE === "1" && typeof process.env.CODEX_REVIEW_SCHEMA_EXECUTABLE === "string";

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "review-dispatch-contract-"));
  const executable = join(root, "fake-codex.mjs");
  const record = join(root, "process-record.json");
  const state = join(root, "failure-state");
  const source = `import { readFile, writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
if (args[0] === "--version") { process.stdout.write("codex fixture"); process.exit(0); }
if (args[0] === "exec" && args[1] === "--help") { process.stdout.write("codex exec fixture"); process.exit(0); }
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
const input = JSON.parse(prompt);
const records = JSON.parse(await readFile(process.env.REVIEW_RECORD, "utf8").catch(() => "[]"));
records.push({ reviewer: input.reviewer, started: Date.now(), args });
await writeFile(process.env.REVIEW_RECORD, JSON.stringify(records));
if (input.reviewer === "review-pr-feature" && process.env.REVIEW_FAIL_ONCE === "true" && !(await readFile(process.env.REVIEW_STATE, "utf8").catch(() => ""))) {
  await writeFile(process.env.REVIEW_STATE, "failed");
  process.stderr.write("fixture launch failure");
  process.exit(23);
}
await new Promise((resolve) => setTimeout(resolve, 20));
const outputPath = args[args.indexOf("--output-last-message") + 1];
await writeFile(outputPath, JSON.stringify({ reviewer: input.reviewer, coverage: [{ requirement: input.reviewer, status: "VERIFIED", evidence: "fixture" }], findings: [] }));`;
  await writeFile(executable, source, "utf8");
  await writeFile(record, "[]", "utf8");
  return { executable, record, root, state };
}

const prompts = REVIEWERS.map((reviewer) => ({ reviewer, prompt: JSON.stringify({ reviewer }) }));

test("requires every reviewer finding field in the response schema", async () => {
  const schema = JSON.parse(await readFile(REVIEW_SCHEMA_PATH, "utf8"));
  const finding = schema.properties.findings.items;
  assert.equal(finding.additionalProperties, false);
  assert.deepEqual(finding.required, [
    "severity",
    "file",
    "line",
    "problem",
    "impact",
    "requirement",
    "correction",
    "rootCause",
    "evidence",
  ]);
  assert.deepEqual(finding.properties.severity.enum, ["BLOCKER", "MAJOR", "MINOR"]);
  assert.equal(finding.properties.line.type, "integer");
});

test(
  "live Codex accepts the reviewer response schema through the direct executable boundary",
  { skip: !RUN_LIVE_SCHEMA_SMOKE },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "review-schema-smoke-"));
    const outputPath = join(root, "last-message.json");
    // biome-ignore lint/style/noProcessEnv: The opt-in smoke test needs the direct executable path.
    const executable = process.env.CODEX_REVIEW_SCHEMA_EXECUTABLE;
    try {
      const result = await new Promise((resolve) => {
        const child = spawn(
          executable,
          [
            "exec",
            "--model",
            "gpt-5.6-luna",
            "-c",
            "model_reasoning_effort=none",
            "-s",
            "read-only",
            "--ignore-user-config",
            "--ignore-rules",
            "--skip-git-repo-check",
            "--ephemeral",
            "-C",
            root,
            "--output-schema",
            REVIEW_SCHEMA_PATH,
            "--output-last-message",
            outputPath,
            "-",
          ],
          { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
        );
        let stderr = "";
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.once("close", (code, signal) => resolve({ code, signal, stderr }));
        child.stdin.end(
          'Return exactly {"reviewer":"review-pr-feature","coverage":[{"requirement":"schema smoke","status":"VERIFIED","evidence":"live Codex"}],"findings":[]}.',
        );
      });
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.signal, null);
      const response = JSON.parse(await readFile(outputPath, "utf8"));
      assert.equal(response.reviewer, "review-pr-feature");
      assert.deepEqual(response.findings, []);
      assert.doesNotMatch(result.stderr, INVALID_SCHEMA_PATTERN);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("serializes Windows reviewers through a direct executable boundary", async () => {
  const fixture = await createFixture();
  let activeProcesses = 0;
  let maximumProcesses = 0;
  const launches = [];
  const recordingSpawn = (executable, args, options) => {
    launches.push({ args, executable, options });
    activeProcesses += 1;
    maximumProcesses = Math.max(maximumProcesses, activeProcesses);
    const child = spawn(executable, args, options);
    child.once("close", () => {
      activeProcesses -= 1;
    });
    return child;
  };
  try {
    const result = await dispatchReviewers({
      reviewers: prompts,
      executable: process.execPath,
      prefixArgs: [fixture.executable],
      schemaPath: REVIEW_SCHEMA_PATH,
      tempRoot: fixture.root,
      env: { REVIEW_RECORD: fixture.record },
      platform: "win32",
      spawnImpl: recordingSpawn,
    });
    assert.equal(result.terminal, true);
    assert.equal(result.maxConcurrency, WINDOWS_REVIEWER_CONCURRENCY);
    assert.equal(maximumProcesses, WINDOWS_REVIEWER_CONCURRENCY);
    assert.equal(result.reviews.length, REVIEWERS.length);
    assert.deepEqual(result.reviews.map(({ reviewer }) => reviewer), REVIEWERS);
    for (const review of result.reviews) {
      assert.deepEqual(review.result, {
        reviewer: review.reviewer,
        coverage: [{ requirement: review.reviewer, status: "VERIFIED", evidence: "fixture" }],
        findings: [],
      });
      assert.equal(review.execution.status, "completed");
      assert.equal(review.execution.shell, false);
      assert.deepEqual(review.execution.command.slice(0, 2), [process.execPath, fixture.executable]);
      assert.equal(review.execution.command.some((value) => WRAPPER_PATTERN.test(value)), false);
    }
    const records = JSON.parse(await readFile(fixture.record, "utf8"));
    assert.deepEqual(records.map(({ reviewer }) => reviewer), REVIEWERS);
    assert.equal(records.some(({ args }) => args.some((value) => WRAPPER_PATTERN.test(value))), false);
    assert.equal(launches.every(({ options }) => options.shell === false), true);
    assert.equal(launches.every(({ executable, args }) => executable === process.execPath && args[0] === fixture.executable), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("keeps failed launches incomplete and retries only that reviewer", async () => {
  const fixture = await createFixture();
  try {
    const failed = await dispatchReviewers({
      reviewers: prompts,
      executable: process.execPath,
      prefixArgs: [fixture.executable],
      schemaPath: REVIEW_SCHEMA_PATH,
      tempRoot: fixture.root,
      env: { REVIEW_RECORD: fixture.record, REVIEW_FAIL_ONCE: "true", REVIEW_STATE: fixture.state },
      platform: "win32",
    });
    assert.equal(failed.terminal, false);
    assert.equal(failed.reviews[0].reviewer, "review-pr-feature");
    assert.equal(failed.reviews[0].execution.status, "incomplete");
    assert.equal(failed.reviews[0].execution.exitCode, 23);
    assert.equal(failed.reviews.slice(1).every(({ execution }) => execution.status === "completed"), true);

    const retry = await dispatchReviewers({
      reviewers: [prompts[0]],
      executable: process.execPath,
      prefixArgs: [fixture.executable],
      schemaPath: REVIEW_SCHEMA_PATH,
      tempRoot: fixture.root,
      env: { REVIEW_RECORD: fixture.record, REVIEW_FAIL_ONCE: "true", REVIEW_STATE: fixture.state },
      platform: "win32",
    });
    assert.equal(retry.terminal, true);
    assert.equal(retry.reviews[0].execution.status, "completed");
    const records = JSON.parse(await readFile(fixture.record, "utf8"));
    assert.deepEqual(records.map(({ reviewer }) => reviewer), [...REVIEWERS, "review-pr-feature"]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects arbitrary Windows reviewer wrappers before launch", async () => {
  await assert.rejects(
    dispatchReviewers({ reviewers: [prompts[0]], executable: "powershell.exe", platform: "win32" }),
    /rejects shell wrapper/,
  );
  await assert.rejects(
    dispatchReviewers({ reviewers: [prompts[0]], executable: "codex.exe", prefixArgs: ["run-reviewer.ps1"], platform: "win32" }),
    /rejects shell wrapper/,
  );
});
