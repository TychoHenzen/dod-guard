import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkpointRemainder } from "../../../lib/preflight-checkpoint.mjs";
import { runCli } from "./collapse-context-runs.mjs";

const HEAD = "abc1234";
const base = { provider: "github-actions", workflow: "codeql.yml", ref: "codex/1165", headSha: HEAD, state: "present" };
const run = (event, runId) => ({ context: "Analyze C#", event, runId, ...base });
const row = (runId) => ({ context: "Analyze C#", runId, ...base });
const USAGE = "usage: node collapse-context-runs.mjs --runs-file=<runs.json>";

function sink() {
  const chunks = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join("") };
}

function execute(t, content, argv = null) {
  const dir = mkdtempSync(path.join(tmpdir(), "collapse-context-runs-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "runs.json");
  writeFileSync(file, content);
  const stdout = sink();
  const stderr = sink();
  const code = runCli(argv ?? [`--runs-file=${file}`], { stdout, stderr });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

test("writes the one pull_request row, and the checkpoint reader accepts it at the head", (t) => {
  const result = execute(t, JSON.stringify([run("push", 11), run("pull_request", 12)]));
  const rows = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.deepEqual(rows, [row(12)]);
  assert.deepEqual(checkpointRemainder(rows, HEAD), []);
});

test("exits 1 with an empty stdout when one event ran twice", (t) => {
  const result = execute(t, JSON.stringify([run("pull_request", 11), run("pull_request", 12)]));

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "required context Analyze C# has more than one pull_request run\n");
});

test("exits 1 for several events with no pull_request run, and 0 for a lone push run", (t) => {
  const stopped = execute(t, JSON.stringify([run("push", 11), run("workflow_dispatch", 12)]));
  const lone = execute(t, JSON.stringify([run("push", 11)]));

  assert.deepEqual([stopped.code, stopped.stdout, lone.code], [1, "", 0]);
  assert.match(stopped.stderr, /^required context Analyze C# has push and workflow_dispatch runs but no pull_request/);
  assert.deepEqual(JSON.parse(lone.stdout), [row(11)]);
});

test("exits 1 for a run that names its context with name instead of context", (t) => {
  const renamed = { name: "Analyze C#", event: "pull_request", runId: 11, ...base };
  const result = execute(t, JSON.stringify([renamed]));

  assert.deepEqual([result.code, result.stderr], [1, "run 1 is malformed\n"]);
});

test("the reader still names a checkpoint that holds both rows of one context", () => {
  const remainder = checkpointRemainder([row(11), row(12)], HEAD);

  assert.deepEqual(remainder, ["required context Analyze C# appears more than once"]);
});

test("exits 2 with the usage line for a missing option, an extra option, and a bare word", (t) => {
  for (const argv of [[], ["--runs-file=x.json", "--extra=1"], ["runs.json"]]) {
    const result = execute(t, "[]", argv);

    assert.equal(result.code, 2);
    assert.match(result.stderr, /--runs-file=<runs\.json> is the only option and is required/);
    assert.ok(result.stderr.endsWith(`${USAGE}\n`));
  }
});

test("exits 2 for an unreadable file, invalid JSON, and a JSON value that is not an array", (t) => {
  const missing = execute(t, "[]", ["--runs-file=no-such-runs.json"]);
  const invalid = execute(t, "{not json");
  const object = execute(t, "{}");

  assert.match(missing.stderr, /^cannot read --runs-file no-such-runs\.json\n/);
  assert.match(invalid.stderr, /^--runs-file is not valid JSON\n/);
  assert.match(object.stderr, /^--runs-file must hold a JSON array\n/);
  assert.deepEqual([missing.code, invalid.code, object.code], [2, 2, 2]);
});

test("a rerun over the corrected runs file prints the row", (t) => {
  const stopped = execute(t, JSON.stringify([run("pull_request", 11), run("pull_request", 12)]));
  const rerun = execute(t, JSON.stringify([run("pull_request", 12)]));

  assert.equal(stopped.code, 1);
  assert.equal(rerun.code, 0);
  assert.deepEqual(JSON.parse(rerun.stdout), [row(12)]);
});
