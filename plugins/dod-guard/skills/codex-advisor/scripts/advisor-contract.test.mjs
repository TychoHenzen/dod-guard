import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runAdvisor } from "./run-advisor.mjs";

const skillDirectory = fileURLToPath(new URL("../", import.meta.url));
const skill = await readFile(`${skillDirectory}SKILL.md`, "utf8");
const schema = JSON.parse(await readFile(`${skillDirectory}response-schema.json`, "utf8"));

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "codex-advisor-test-"));
  const runs = join(root, "runs");
  const record = join(root, "record.json");
  const executable = join(root, "fake-codex.mjs");
  await mkdir(runs);
  await writeFile(
    executable,
    `import { writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
const input = await new Promise((resolve) => {
  let value = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { value += chunk; });
  process.stdin.on("end", () => resolve(value));
});
await writeFile(process.env.ADVISOR_RECORD, JSON.stringify({ args, cwd: process.cwd(), input }));
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
  default:
    await writeFile(outputPath, JSON.stringify({ advice: "Use the smallest safe change." }));
}
`,
  );
  return { env: { ADVISOR_RECORD: record }, executable, record, root, runs };
}

async function runFixture(fixture, mode, options = {}) {
  const result = await runAdvisor({
    env: { ...fixture.env, ADVISOR_MODE: mode },
    executable: process.execPath,
    prefixArgs: [fixture.executable],
    prompt: "Problem with\nmultiple lines.",
    tempRoot: fixture.runs,
    timeoutMs: options.timeoutMs ?? 2_000,
  });
  assert.deepEqual(await readdir(fixture.runs), []);
  return result;
}

test("advisor runner uses an isolated bounded Codex process", async () => {
  const fixture = await createFixture();
  try {
    const result = await runFixture(fixture, "valid");
    assert.deepEqual(result, { ok: true, advice: "Use the smallest safe change." });
    const record = JSON.parse(await readFile(fixture.record, "utf8"));
    assert.equal(record.input, "Problem with\nmultiple lines.");
    assert.notEqual(record.cwd, process.cwd());
    assert.equal(record.args[0], "exec");
    assert.ok(record.args.includes("-s"));
    assert.ok(record.args.includes("read-only"));
    assert.ok(record.args.includes("--ignore-user-config"));
    assert.ok(record.args.includes("--ignore-rules"));
    assert.ok(record.args.includes("--skip-git-repo-check"));
    assert.ok(record.args.includes("--ephemeral"));
    assert.ok(record.args.includes("--output-schema"));
    assert.ok(record.args.includes("--output-last-message"));
    assert.equal(record.args.at(-1), "-");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("advisor runner exposes start, exit, output, schema, and timeout failures", async () => {
  const fixture = await createFixture();
  try {
    const cases = [
      ["nonzero", /exits non-zero with code 7/],
      ["missing-output", /output file is missing or unreadable/],
      ["empty-output", /output file is empty/],
      ["malformed", /not valid JSON/],
      ["invalid-schema", /non-whitespace advice/],
      ["whitespace", /non-whitespace advice/],
      ["hang", /timed out after 50 ms/, { timeoutMs: 50 }],
    ];
    for (const [mode, expected, options] of cases) {
      const result = await runFixture(fixture, mode, options);
      assert.equal(result.ok, false);
      assert.match(result.error, expected);
    }
    const missing = await runAdvisor({
      executable: "codex-advisor-command-that-does-not-exist",
      prompt: "Problem",
      tempRoot: fixture.runs,
    });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /missing or cannot start/);
    assert.deepEqual(await readdir(fixture.runs), []);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("advisor skill has the bounded Codex invocation contract", () => {
  assert.match(skill, /^---\nname: codex-advisor\n/m);
  for (const signal of [
    /scripts[\\/]run-advisor\.mjs/,
    /lowest reasoning value reported by that current CLI/,
    /empty,\s+non-repository working directory/,
    /-s read-only/,
    /--ignore-user-config/,
    /--ignore-rules/,
    /--skip-git-repo-check/,
    /--ephemeral/,
    /finite\s+timeout/,
    /kills\s+the process tree/,
    /cleans up its temporary\s+directory on every\s+exit path/,
    /stdin/,
    /--output-schema/,
    /skip repository research/,
    /avoid\s+all tools and mutations/,
  ]) {
    assert.match(skill, signal);
  }
  assert.doesNotMatch(skill, /codec\s+exec/);
  assert.doesNotMatch(skill, /dangerously-bypass/);
  assert.doesNotMatch(skill, /researched host/);
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
    /timed[- ]out/,
    /output file is missing, empty, not valid JSON/,
    /Do not hide a command failure behind a guessed or partial answer/,
  ]) {
    assert.match(skill, signal);
  }
});
