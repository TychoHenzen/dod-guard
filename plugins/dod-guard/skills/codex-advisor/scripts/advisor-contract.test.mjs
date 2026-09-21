import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runAdvisor } from "./run-advisor.mjs";

const skillDirectory = fileURLToPath(new URL("../", import.meta.url));
const skill = await readFile(`${skillDirectory}SKILL.md`, "utf8");
const runner = await readFile(new URL("./run-advisor.mjs", import.meta.url), "utf8");
const schema = JSON.parse(await readFile(`${skillDirectory}response-schema.json`, "utf8"));

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "codex-advisor-test-"));
  const runs = join(root, "runs");
  const record = join(root, "record.json");
  const executable = join(root, "fake-codex.mjs");
  const commandExecutable = join(root, "fake-codex.cmd");
  await mkdir(runs);
  await writeFile(
    executable,
    `import { readFile, writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
const input = await new Promise((resolve) => {
  let value = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { value += chunk; });
  process.stdin.on("end", () => resolve(value));
});
if (args[0] === "--version") {
  process.stdout.write("codex-cli fixture");
  process.exit(0);
}
if (args[0] === "exec" && args[1] === "--help") {
  if (process.env.ADVISOR_MODE === "unsupported-help") {
    process.stderr.write("unexpected argument '--ask-for-approval'");
    process.exit(2);
  }
  process.stdout.write("--approve-for-me");
  process.exit(0);
}
const record = { args, cwd: process.cwd(), input };
const previous = await readFile(process.env.ADVISOR_RECORD, "utf8").catch(() => "[]");
const records = JSON.parse(previous);
records.push(record);
await writeFile(process.env.ADVISOR_RECORD, JSON.stringify(records));
const outputIndex = args.indexOf("--output-last-message");
const outputPath = outputIndex === -1 ? undefined : args[outputIndex + 1];
switch (process.env.ADVISOR_MODE) {
  case "nonzero":
    process.stderr.write("fixture failure");
    process.exit(7);
  case "missing-output":
    break;
  case "empty-output":
    await writeFile(outputPath, "");
    break;
  case "malformed":
    await writeFile(outputPath, "{");
    break;
  case "invalid-schema":
    await writeFile(outputPath, JSON.stringify({ advice: 42 }));
    break;
  case "whitespace":
    await writeFile(outputPath, JSON.stringify({ advice: "   " }));
    break;
  case "hang":
    await new Promise(() => {});
    break;
  case "slow":
    await new Promise((resolve) => setTimeout(resolve, 100));
    await writeFile(outputPath, JSON.stringify({ advice: "Use the smallest safe change." }));
    break;
  case "large-output":
    process.stdout.write("x".repeat(8 * 1024 * 1024 + 1));
    break;
  default:
    await writeFile(outputPath, JSON.stringify({ advice: "Use the smallest safe change." }));
}
`,
  );
  await writeFile(commandExecutable, `@echo off\r\nnode "${executable}" %*\r\n`);
  return { commandExecutable, env: { ADVISOR_RECORD: record }, executable, record, root, runs };
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

test("advisor runner rejects shell metacharacters before a Windows executable starts", { skip: process.platform !== "win32" }, async () => {
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
    assert.deepEqual(result, {
      ok: false,
      error: "Codex advisor model contains unsupported shell characters",
    });
    await assert.rejects(readFile(marker));
    assert.deepEqual(await readdir(fixture.runs), []);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("advisor skill has the Codex invocation contract", () => {
  assert.match(skill, /^---\nname: codex-advisor\n/m);
  for (const signal of [
    /scripts[\\/]run-advisor\.mjs/,
    /`gpt-5\.6-luna` with\s+`max` effort by default/,
    /does not enumerate reasoning values/i,
    /empty,\s+non-repository working directory/,
    /-s read-only/,
    /--ignore-user-config/,
    /--ignore-rules/,
    /--skip-git-repo-check/,
    /--ephemeral/,
    /waits for the advisor process to exit/,
    /cleans up\s+its temporary\s+directory on every\s+exit path/,
    /stdin/,
    /--output-schema/,
    /--model/,
    /requested model and reasoning effort/i,
    /skip repository research/,
    /avoid\s+all tools and mutations/,
    /codex\.exe.*Windows|Windows.*codex\.exe/i,
  ]) {
    assert.match(skill, signal);
  }
  assert.doesNotMatch(skill, /codec\s+exec/);
  assert.doesNotMatch(skill, /dangerously-bypass/);
  assert.doesNotMatch(skill, /researched host/);
});

test("advisor runner does not impose a wall-clock kill", () => {
  assert.doesNotMatch(runner, /timeoutMs|--timeout-ms|setTimeout/);
});

test("advisor runner uses direct Windows executable invocation", () => {
  assert.match(runner, /resolveCodexExecutable/);
  assert.match(runner, /shell: false/);
  assert.match(runner, /buildCodexPreflightArgs/);
  assert.match(runner, /buildCodexExecArgs/);
});

test("advisor defaults to Luna max for confirmed blockers", () => {
  assert.match(runner, /optionValue\("--model", "gpt-5\.6-luna"\)/);
  assert.match(runner, /optionValue\("--reasoning-effort", "max"\)/);
  assert.match(runner, /model = "gpt-5\.6-luna"/);
  assert.match(runner, /reasoningEffort = "max"/);
});

test("advisor schema rejects whitespace-only advice", () => {
  assert.deepEqual(schema.required, ["advice"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.advice.type, "string");
  assert.equal(schema.properties.advice.minLength, 1);
  assert.equal(schema.properties.advice.pattern, "\\S");
});

test("advisor failures are observable and never relayed as advice", () => {
  for (const signal of [
    /executable is missing or cannot start/,
    /exits non-zero/,
    /output file is missing, empty, not valid JSON/,
    /Do not hide a command failure behind a guessed or partial answer/,
  ]) {
    assert.match(skill, signal);
  }
});
