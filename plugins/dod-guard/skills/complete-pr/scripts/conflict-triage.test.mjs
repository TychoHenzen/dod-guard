// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: The test runs the shipped command.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: The test writes a temporary repository.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: The test writes a temporary repository.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: The test writes a temporary repository.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: The test resolves the shipped command.
import { fileURLToPath } from "node:url";
import { createGitRunner } from "./lib/conflict-triage.mjs";
import { runCommand } from "./lib/conflict-triage-command.mjs";
import { BRANCH, createScenario, originHead, sh, writeFiles } from "./lib/conflict-triage.test-support.mjs";

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

test("refuses a state file whose name only starts with two dots", () => {
  const workspace = createWorkspace();
  try {
    const result = run(workspace.work, ["abort", "--state", "..state.json"]);
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

test("runs start, verify, commit, and push through the command with an injected client", async () => {
  const scenario = createScenario({
    base: { "src/value.txt": "one\n" },
    branch: { "src/value.txt": "branch\n" },
    master: { "src/value.txt": "master\n" },
  });
  try {
    const scratch = join(scenario.root, "scratch");
    mkdirSync(scratch);
    const state = join(scratch, "state.json");
    const decisions = join(scratch, "decisions.json");
    const generators = join(scratch, "generators.json");
    writeFileSync(generators, "[]");
    const git = createGitRunner(scenario.work);
    const createClient = () => ({
      getPullRequest: () => scenario.pullRequest,
      getRepository: () => ({ defaultBranch: "master" }),
    });
    const startFlags = { generators, pull: "1", repository: "owner/repo", state, "trusted-head": scenario.trustedHead };
    const started = await runCommand("start", git, startFlags, { createClient });
    assert.deepEqual(started.conflicts, [{ class: "source", code: "UU", path: "src/value.txt" }]);
    const saved = JSON.parse(readFileSync(state, "utf8"));
    assert.equal(saved.branch, BRANCH);
    assert.equal(saved.recordedBase, scenario.baseSha);
    assert.equal(saved.pullNumber, 1);

    writeFiles(scenario.work, { "src/value.txt": "branch\nmaster\n" });
    sh(scenario.work, ["add", "src/value.txt"]);
    writeFileSync(decisions, JSON.stringify([{ basis: "AC-1 keeps both", decision: "combine", path: "src/value.txt" }]));
    assert.deepEqual(await runCommand("verify", git, { decisions, state }), { ok: true, problems: [] });
    const { mergeSha } = await runCommand("commit", git, { message: "Merge master", state });
    assert.equal(JSON.parse(readFileSync(state, "utf8")).mergeSha, mergeSha);
    const pushed = await runCommand("push", git, { state }, { createClient });
    assert.equal(pushed.remoteHead, mergeSha);
    assert.equal(originHead(scenario), mergeSha);
    assert.equal(
      sh(scenario.work, ["rev-list", "--parents", "-n", "1", mergeSha]),
      `${mergeSha} ${scenario.trustedHead} ${scenario.baseSha}`,
    );
  } finally {
    scenario.cleanup();
  }
});

test("refuses start without the declared generator list", () => {
  const workspace = createWorkspace();
  try {
    const state = join(workspace.scratch, "triage.json");
    const args = ["start", "--state", state, "--repository", "owner/repo", "--pull", "1"];
    const result = run(workspace.work, [...args, "--trusted-head", "a".repeat(40)]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Missing --generators/);
  } finally {
    workspace.cleanup();
  }
});

// A command-level scenario whose start has its inputs outside the repository.
function commandScenario() {
  const scenario = createScenario({
    base: { "src/value.txt": "one\n" },
    branch: { "src/value.txt": "branch\n" },
    master: { "src/value.txt": "master\n" },
  });
  const scratch = join(scenario.root, "scratch");
  mkdirSync(scratch);
  const generators = join(scratch, "generators.json");
  writeFileSync(generators, "[]");
  const createClient = () => ({
    getPullRequest: () => scenario.pullRequest,
    getRepository: () => ({ defaultBranch: "master" }),
  });
  const flags = (state) => ({
    generators,
    pull: "1",
    repository: "owner/repo",
    state,
    "trusted-head": scenario.trustedHead,
  });
  return { createClient, flags, git: createGitRunner(scenario.work), scenario, scratch };
}

function mergeInProgress(work) {
  return spawnSync("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { cwd: work }).status === 0;
}

test("records a precondition stop in the state file so record can render it", async () => {
  const { createClient, flags, git, scenario, scratch } = commandScenario();
  try {
    const state = join(scratch, "state.json");
    writeFiles(scenario.work, { "notes.txt": "pending\n" });
    await assert.rejects(runCommand("start", git, flags(state), { createClient }), { code: "worktree_dirty" });
    assert.equal(JSON.parse(readFileSync(state, "utf8")).stop.stop, "worktree_dirty");
    const record = await runCommand("record", git, { state });
    assert.match(record, /- Stop: worktree_dirty: The worktree has pending changes\./);
    assert.equal(mergeInProgress(scenario.work), false);
  } finally {
    scenario.cleanup();
  }
});

test("merges nothing when the state file cannot be written", async () => {
  const { createClient, flags, git, scenario, scratch } = commandScenario();
  try {
    const state = join(scratch, "missing", "state.json");
    await assert.rejects(runCommand("start", git, flags(state), { createClient }), /ENOENT/);
    assert.equal(mergeInProgress(scenario.work), false);
    assert.equal(sh(scenario.work, ["rev-parse", "HEAD"]), scenario.trustedHead);
  } finally {
    scenario.cleanup();
  }
});

test("a stopped start keeps the recorded base so abort undoes the earlier merge", async () => {
  const { createClient, flags, git, scenario, scratch } = commandScenario();
  try {
    const state = join(scratch, "state.json");
    await runCommand("start", git, flags(state), { createClient });
    await assert.rejects(runCommand("start", git, flags(state), { createClient }), { code: "merge_in_progress" });
    assert.equal(JSON.parse(readFileSync(state, "utf8")).recordedBase, scenario.baseSha);
    assert.deepEqual(await runCommand("abort", git, { state }), { merge: "aborted" });
    assert.equal(mergeInProgress(scenario.work), false);
  } finally {
    scenario.cleanup();
  }
});
