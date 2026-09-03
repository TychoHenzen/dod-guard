import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const FIND = fileURLToPath(new URL("./find-runs.mjs", import.meta.url));
const EXTRACT = fileURLToPath(new URL("./extract-run.mjs", import.meta.url));

function record(object) {
  return JSON.stringify(object);
}

function call(name, at) {
  const text = `<command-name>/${name}</command-name>`;
  return record({ type: "user", message: { content: text }, timestamp: at });
}

function bash(command) {
  const content = [{ type: "tool_use", name: "Bash", input: { command } }];
  return record({ type: "assistant", message: { content } });
}

// One project holding one session, laid out the way Claude Code writes them.
function projects(lines) {
  const root = mkdtempSync(join(tmpdir(), "skill-debug-"));
  const dir = join(root, "C--work-thing");
  mkdirSync(dir);
  writeFileSync(join(dir, "abcd1234-session.jsonl"), `${lines.join("\n")}\n`);
  return root;
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

const SESSION = [
  call("tighten", "2026-08-01T19:03:00.000Z"),
  bash("node pick-target.mjs"),
  bash("git status"),
];

describe("find-runs CLI", () => {
  it("exits 3 and prints usage without a skill", () => {
    const result = run(FIND, []);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Usage: node find-runs\.mjs/);
  });

  it("lists a run with its session, project and counts", () => {
    const root = projects(SESSION);
    const result = run(FIND, ["--skill=tighten", `--projects=${root}`]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /2026-08-01 19:03/);
    assert.match(result.stdout, /abcd1234/);
    assert.match(result.stdout, /C--work-thing/);
    assert.match(result.stdout, /2 steps/);
  });

  it("exits 4 when the skill never ran", () => {
    const root = projects(SESSION);
    const result = run(FIND, ["--skill=blind-rewrite", `--projects=${root}`]);
    assert.equal(result.status, 4);
    assert.match(result.stdout, /no run of blind-rewrite/);
  });
});

describe("extract-run CLI", () => {
  it("prints a numbered trace for a session id prefix", () => {
    const root = projects(SESSION);
    const result = run(EXTRACT, [
      "--session=abcd",
      "--skill=tighten",
      `--projects=${root}`,
    ]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /boundary: run ends at end of transcript/);
    assert.match(result.stdout, /tool\s+Bash node pick-target\.mjs/);
  });

  it("exits 4 for a session that does not exist", () => {
    const root = projects(SESSION);
    const args = ["--session=zzzz", "--skill=tighten", `--projects=${root}`];
    assert.equal(run(EXTRACT, args).status, 4);
  });

  it("exits 4 when that run number is past the end", () => {
    const root = projects(SESSION);
    const result = run(EXTRACT, [
      "--session=abcd",
      "--skill=tighten",
      "--run=2",
      `--projects=${root}`,
    ]);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /1 runs of tighten/);
  });
});
