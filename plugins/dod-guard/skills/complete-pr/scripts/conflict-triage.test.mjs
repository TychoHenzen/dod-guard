// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: The test runs the shipped command.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: The test writes a temporary repository.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: The test writes a temporary repository.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: The test writes a temporary repository.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: The test resolves the shipped command.
import { fileURLToPath } from "node:url";

const COMMAND = fileURLToPath(new URL("./conflict-triage.mjs", import.meta.url));

function createWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "conflict-triage-cli-"));
  const work = join(root, "work");
  const scratch = join(root, "scratch");
  mkdirSync(scratch);
  spawnSync("git", ["init", "-q", "-b", "master", work], { encoding: "utf8" });
  return { cleanup: () => rmSync(root, { force: true, recursive: true }), scratch, work };
}

function run(cwd, args) {
  return spawnSync(process.execPath, [COMMAND, ...args], { cwd, encoding: "utf8", windowsHide: true });
}

test("prints usage and exits 2 without a command", () => {
  const workspace = createWorkspace();
  try {
    const result = run(workspace.work, []);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage: node conflict-triage\.mjs <command>/);
  } finally {
    workspace.cleanup();
  }
});

test("refuses a state file inside the repository", () => {
  const workspace = createWorkspace();
  try {
    const result = run(workspace.work, ["abort", "--state", join(workspace.work, "triage.json")]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /outside the repository/);
  } finally {
    workspace.cleanup();
  }
});

test("aborts nothing and renders the record from an outside state file", () => {
  const workspace = createWorkspace();
  try {
    const state = join(workspace.scratch, "triage.json");
    writeFileSync(
      state,
      JSON.stringify({ conflicts: [], recordedBase: "b".repeat(40), trustedHead: "c".repeat(40) }),
    );
    const abort = run(workspace.work, ["abort", "--state", state]);
    assert.equal(abort.status, 0, abort.stderr);
    assert.deepEqual(JSON.parse(abort.stdout), { merge: "none" });
    const record = run(workspace.work, ["record", "--state", state]);
    assert.equal(record.status, 0, record.stderr);
    assert.match(record.stdout, /^## Conflict triage\n/);
    assert.match(record.stdout, /- Merge: none/);
  } finally {
    workspace.cleanup();
  }
});

test("checks regeneration against the declared generators in the state file", () => {
  const workspace = createWorkspace();
  try {
    const state = join(workspace.scratch, "triage.json");
    writeFileSync(state, JSON.stringify({ generators: [{ command: "node build.mjs", paths: ["dist/*.js"] }] }));
    mkdirSync(join(workspace.work, "dist"));
    writeFileSync(join(workspace.work, "dist", "out.js"), "// rebuilt\n");
    const declared = run(workspace.work, ["regen-check", "--state", state]);
    assert.equal(declared.status, 0, declared.stderr);
    assert.deepEqual(JSON.parse(declared.stdout), { generatedPaths: ["dist/out.js"], ok: true, problems: [] });
    const drift = run(workspace.work, ["regen-check", "--state", state, "--expect-clean"]);
    assert.equal(drift.status, 1);
    assert.equal(JSON.parse(drift.stdout).ok, false);
    writeFileSync(join(workspace.work, "notes.txt"), "stray\n");
    const stray = run(workspace.work, ["regen-check", "--state", state]);
    assert.equal(stray.status, 1);
    assert.deepEqual(JSON.parse(stray.stdout).problems, [
      { path: "notes.txt", problem: "the generator changed a path it does not declare" },
    ]);
  } finally {
    workspace.cleanup();
  }
});

test("rejects an unknown command", () => {
  const workspace = createWorkspace();
  try {
    const state = join(workspace.scratch, "triage.json");
    writeFileSync(state, "{}");
    const result = run(workspace.work, ["rebase", "--state", state]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown command: rebase/);
  } finally {
    workspace.cleanup();
  }
});
