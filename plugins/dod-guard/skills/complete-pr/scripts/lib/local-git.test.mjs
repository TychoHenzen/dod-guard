// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { LocalGit, parseWorktrees } from "./local-git.mjs";

const TARGET_BRANCH = "codex/24-complete-pr";
const CURRENT_ROOT = "C:/repo";
const FEATURE_ROOT = "C:/repo-feature";
const ROOT_WORKTREE = "worktree C:/repo\nHEAD base\nbranch refs/heads/master\n";
const INITIAL_WORKTREES = `${ROOT_WORKTREE}\nworktree C:/repo-feature\nHEAD feature\nbranch refs/heads/${TARGET_BRANCH}\n`;

function command(args) {
  return args.join("\u0000");
}

function result(stdout = "", status = 0) {
  return { status, stderr: "", stdout };
}

function takeResponse(responses, key) {
  const values = responses.get(key);
  if (!values) {
    throw new Error(`Unexpected Git command: ${key.replaceAll("\u0000", " ")}`);
  }
  if (values.length > 1) {
    return values.shift();
  }
  return values[0];
}

function createGitFixture(entries) {
  const responses = new Map(entries.map(([args, values]) => [command(args), [...values]]));
  const calls = [];
  return {
    calls,
    runner(args) {
      calls.push(args);
      return takeResponse(responses, command(args));
    },
  };
}

function baseEntries(worktreeResults, currentBranch = "master") {
  return [
    [["branch", "--show-current"], [result(`${currentBranch}\n`)]],
    [["worktree", "list", "--porcelain"], worktreeResults],
    [["show-ref", "--verify", "--quiet", `refs/heads/${TARGET_BRANCH}`], [result()]],
  ];
}

test("parses worktree records without inferring unrelated branches", () => {
  assert.deepEqual(parseWorktrees(INITIAL_WORKTREES), [
    { branch: "master", locked: false, path: CURRENT_ROOT },
    { branch: TARGET_BRANCH, locked: false, path: FEATURE_ROOT },
  ]);
});

test("dry run reports a removable exact-branch worktree without mutating Git", () => {
  const fixture = createGitFixture([
    ...baseEntries([result(INITIAL_WORKTREES)]),
    [["-C", FEATURE_ROOT, "status", "--porcelain"], [result()]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master", { dryRun: true });

  assert.equal(cleanup.branch, "would_delete");
  assert.deepEqual(cleanup.worktrees, [{ path: FEATURE_ROOT, result: "would_remove" }]);
  assert.equal(fixture.calls.some((args) => (args[0] === "branch" && args[1] === "-d") || (args[0] === "worktree" && args[1] === "remove")), false);
});

test("removes a clean non-current worktree and confirms local branch deletion", () => {
  const fixture = createGitFixture([
    ...baseEntries([result(INITIAL_WORKTREES), result(ROOT_WORKTREE)]),
    [["-C", FEATURE_ROOT, "status", "--porcelain"], [result()]],
    [["worktree", "remove", "--", FEATURE_ROOT], [result()]],
    [["show-ref", "--verify", "--quiet", `refs/heads/${TARGET_BRANCH}`], [result(), result("", 1)]],
    [["branch", "-d", "--", TARGET_BRANCH], [result()]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master");

  assert.equal(cleanup.branch, "deleted");
  assert.deepEqual(cleanup.remainingWorktrees, []);
  assert.deepEqual(cleanup.worktrees, [{ path: FEATURE_ROOT, result: "removed" }]);
});

test("identifies the current worktree by branch despite a Windows path alias", () => {
  const currentFeature = `worktree C:/Users/siriu/mcp-servers/dod-guard-142-recovery\nHEAD feature\nbranch refs/heads/${TARGET_BRANCH}\n`;
  const fixture = createGitFixture([
    ...baseEntries([result(currentFeature), result(ROOT_WORKTREE)], TARGET_BRANCH),
    [["-C", "C:/Users/siriu/mcp-servers/dod-guard-142-recovery", "status", "--porcelain"], [result()]],
    [["fetch", "--no-tags", "origin", "master"], [result()]],
    [["switch", "master"], [result()]],
    [["merge", "--ff-only", "origin/master"], [result()]],
    [["show-ref", "--verify", "--quiet", `refs/heads/${TARGET_BRANCH}`], [result(), result("", 1)]],
    [["branch", "-d", "--", TARGET_BRANCH], [result()]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master");

  assert.equal(cleanup.branch, "deleted");
  assert.deepEqual(cleanup.worktrees, [{ path: "C:/Users/siriu/mcp-servers/dod-guard-142-recovery", result: "switched_to_default" }]);
});

test("preserves a dirty exact-branch worktree and its local ref", () => {
  const fixture = createGitFixture([
    ...baseEntries([result(INITIAL_WORKTREES)]),
    [["-C", FEATURE_ROOT, "status", "--porcelain"], [result(" M user-work.txt\n")]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master");

  assert.equal(cleanup.branch, "retained_by_worktree");
  assert.deepEqual(cleanup.worktrees, [{ path: FEATURE_ROOT, result: "dirty" }]);
  assert.equal(fixture.calls.some((args) => (args[0] === "branch" && args[1] === "-d") || (args[0] === "worktree" && args[1] === "remove")), false);
});
