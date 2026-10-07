import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { promisify } from "node:util";
import { runAdvisor } from "./run-advisor.mjs";

const execFileAsync = promisify(execFile);

// The fake CLI is a real file; only the Windows .cmd shim that wraps it is generated per run.
const fakeCodex = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "codex-advisor-test-"));
  const runs = join(root, "runs");
  const record = join(root, "record.json");
  const commandExecutable = join(root, "fake-codex.cmd");
  await mkdir(runs);
  await writeFile(commandExecutable, `@echo off\r\nnode "${fakeCodex}" %*\r\n`);
  return {
    commandExecutable,
    env: { ADVISOR_RECORD: record, ADVISOR_STATE: join(root, "state.txt") },
    executable: fakeCodex,
    record,
    root,
    runs,
  };
}

async function runFixture(fixture, mode, options = {}) {
  const result = await runAdvisor({
    env: { ...fixture.env, ADVISOR_MODE: mode },
    executable: process.execPath,
    prefixArgs: [fixture.executable],
    prompt: "Problem with\nmultiple lines.",
    tempRoot: fixture.runs,
    ...options,
  });
  assert.deepEqual(await readdir(fixture.runs), []);
  return result;
}

test("advisor runner uses an isolated Codex process", async () => {
  const fixture = await createFixture();
  try {
    const result = await runFixture(fixture, "valid", {
      model: "gpt-test-model",
      reasoningEffort: "medium",
    });
    assert.equal(result.ok, true);
    assert.equal(result.advice, "Use the smallest safe change.");
    assert.equal(result.capability.executable, process.execPath);
    assert.deepEqual(result.capability.probes.version.command, [process.execPath, fixture.executable, "--version"]);
    assert.deepEqual(result.capability.probes.help.command, [process.execPath, fixture.executable, "exec", "--help"]);
    assert.equal(result.execution.status, "completed");
    assert.equal(result.execution.stage, "reviewer-process");
    assert.equal(result.execution.exitCode, 0);
    assert.equal(result.execution.signal, null);
    assert.deepEqual(result.execution.command.slice(0, 2), [process.execPath, fixture.executable]);
    assert.equal(result.execution.command.at(-1), "-");
    const records = JSON.parse(await readFile(fixture.record, "utf8"));
    assert.equal(records.length, 1);
    const [record] = records;
    assert.equal(record.input, "Problem with\nmultiple lines.");
    assert.notEqual(record.cwd, process.cwd());
    assert.equal(record.args[0], "exec");
    const modelIndex = record.args.indexOf("--model");
    assert.equal(record.args[modelIndex + 1], "gpt-test-model");
    assert.equal(record.args[record.args.indexOf("-c") + 1], "model_reasoning_effort=medium");
    assert.ok(record.args.includes("-s"));
    assert.ok(record.args.includes("read-only"));
    assert.ok(record.args.includes("--ignore-user-config"));
    assert.ok(record.args.includes("--ignore-rules"));
    assert.ok(record.args.includes("--skip-git-repo-check"));
    assert.ok(record.args.includes("--ephemeral"));
    assert.ok(record.args.includes("--output-schema"));
    assert.ok(record.args.includes("--output-last-message"));
    assert.equal(record.args.includes("--approve-for-me"), false);
    assert.equal(record.args.includes("--ask-for-approval"), false);
    assert.equal(record.args.at(-1), "-");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("read-only prefix rejection preserves incomplete pre-launch evidence", async () => {
  const fixture = await createFixture();
  try {
    const result = await runAdvisor({
      executable: process.execPath,
      prefixArgs: [fixture.executable, "--approve-for-me"],
      prompt: "Problem",
      tempRoot: fixture.runs,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /read-only mode rejects --approve-for-me/);
    assert.equal(result.execution.status, "incomplete");
    assert.equal(result.execution.stage, "launcher-contract");
    assert.equal(result.execution.exitCode, null);
    assert.deepEqual(result.execution.prefixArgs, [fixture.executable, "--approve-for-me"]);
    assert.deepEqual(result.execution.command.slice(0, 3), [process.execPath, fixture.executable, "--approve-for-me"]);
    assert.deepEqual(await readdir(fixture.runs), []);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("advisor runner exposes start, exit, output, and schema failures", async () => {
  const fixture = await createFixture();
  try {
    const cases = [
      ["unsupported-help", /unexpected argument '--ask-for-approval'/],
      ["nonzero", /exits non-zero with code 7/],
      ["missing-output", /output file is missing or unreadable/],
      ["empty-output", /output file is empty/],
      ["malformed", /not valid JSON/],
      ["invalid-schema", /non-whitespace advice/],
      ["whitespace", /non-whitespace advice/],
    ];
    for (const [mode, expected, options] of cases) {
      const result = await runFixture(fixture, mode, options);
      assert.equal(result.ok, false);
      assert.equal(result.execution.status, "incomplete");
      assert.ok(result.execution.command.length > 0);
      assert.match(result.error, expected);
    }
    const rejected = await runFixture(fixture, "unsupported-help");
    assert.equal(rejected.execution.stage, "help");
    assert.equal(rejected.execution.exitCode, 2);
    assert.equal(rejected.execution.command.at(-1), "--help");
    const missing = await runAdvisor({
      executable: "codex-advisor-command-that-does-not-exist",
      prompt: "Problem",
      tempRoot: fixture.runs,
    });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /missing or cannot start/);
    assert.equal(missing.execution.status, "incomplete");
    assert.deepEqual(await readdir(fixture.runs), []);

    const slow = await runFixture(fixture, "slow");
    assert.equal(slow.ok, true);
    assert.equal(slow.advice, "Use the smallest safe change.");
    const largeOutput = await runFixture(fixture, "large-output");
    assert.equal(largeOutput.ok, false);
    assert.match(largeOutput.error, /output exceeded/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("advisor runner fails closed on a matching model-metadata fallback event", async () => {
  const fixture = await createFixture();
  try {
    const result = await runFixture(fixture, "fallback", { model: "gpt-test-model" });
    assert.equal(result.ok, false);
    assert.equal(
      result.error,
      "Model metadata for gpt-test-model not found. Defaulting to fallback metadata; " +
        "this can degrade performance and cause issues.",
    );
    assert.equal(result.execution.status, "incomplete");
    assert.equal(result.execution.stage, "reviewer-process");
    assert.equal(result.execution.exitCode, 0);
    assert.equal(result.execution.fallbackEvent.item.type, "error");
    assert.match(result.execution.stdout, /Model metadata for gpt-test-model not found/);

    const clean = await runFixture(fixture, "unrelated-output", { model: "gpt-test-model" });
    assert.equal(clean.ok, true);
    assert.equal(clean.execution.status, "completed");

    const differentModel = await runFixture(fixture, "different-model-fallback", { model: "gpt-test-model" });
    assert.equal(differentModel.ok, true);
    assert.equal(differentModel.execution.status, "completed");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("advisor runner reports an unavailable Windows installation before spawning", async () => {
  const fixture = await createFixture();
  const packageRoot = join(fixture.root, "node_modules", "@openai", "codex");
  try {
    await mkdir(join(packageRoot, "bin"), { recursive: true });
    await writeFile(
      join(fixture.root, "codex.cmd"),
      '@ECHO off\r\nnode "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n',
    );
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@openai/codex" }));
    await writeFile(join(packageRoot, "bin", "codex.js"), "");
    const result = await runAdvisor({
      platform: "win32",
      env: { PATH: fixture.root },
      prompt: "Problem",
      tempRoot: fixture.runs,
      spawnImpl: () => {
        throw new Error("spawn should not run");
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /installation is unavailable.*existing Codex executable/i);
    assert.equal(result.execution, undefined);
    assert.deepEqual(await readdir(fixture.runs), []);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("advisor runner supports explicit cancellation before prompt submission", async () => {
  const fixture = await createFixture();
  const controller = new AbortController();
  try {
    controller.abort();
    const result = await runFixture(fixture, "hang", { signal: controller.signal });
    assert.equal(result.ok, false);
    assert.match(result.error, /cancelled by operator/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("repairs a failed launch and retries with complete evidence without changing checkout", async () => {
  const fixture = await createFixture();
  const checkoutState = async () => {
    const [{ stdout: sha }, { stdout: status }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"]),
      execFileAsync("git", ["status", "--short"]),
    ]);
    return { sha: sha.trim(), status };
  };
  try {
    const before = await checkoutState();
    const failed = await runFixture(fixture, "fail-once");
    assert.equal(failed.ok, false);
    assert.equal(failed.execution.status, "incomplete");
    assert.equal(failed.execution.stage, "help");
    assert.equal(failed.execution.exitCode, 23);
    assert.equal(failed.execution.stderr, "fixture launch failure");

    const repaired = await runFixture(fixture, "valid");
    assert.equal(repaired.ok, true);
    assert.equal(repaired.execution.status, "completed");
    assert.equal(repaired.execution.stage, "reviewer-process");
    assert.equal(repaired.execution.exitCode, 0);
    assert.equal(repaired.capability.probes.version.exitCode, 0);
    assert.equal(repaired.capability.probes.version.stdout, "codex-cli fixture");
    assert.equal(repaired.capability.probes.help.exitCode, 0);
    assert.equal(repaired.capability.probes.help.stdout, "--approve-for-me");
    assert.equal(repaired.execution.command[0], process.execPath);
    assert.equal(repaired.execution.command[1], fixture.executable);

    const after = await checkoutState();
    assert.deepEqual(after, before);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("advisor runner rejects shell metacharacters before a Windows executable starts", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await createFixture();
  const marker = join(fixture.root, "injected.txt");
  try {
    const result = await runAdvisor({
      env: fixture.env,
      executable: fixture.commandExecutable,
      model: `safe&echo INJECTED>${marker}`,
      prompt: "Problem",
      tempRoot: fixture.runs,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "Codex advisor model contains unsupported shell characters");
    assert.equal(result.execution.status, "incomplete");
    assert.equal(result.execution.stage, "launcher-contract");
    assert.equal(result.execution.exitCode, null);
    assert.ok(result.execution.command.includes("--model"));
    assert.ok(result.execution.command.some((value) => value.includes("safe&echo")));
    await assert.rejects(readFile(marker));
    assert.deepEqual(await readdir(fixture.runs), []);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
