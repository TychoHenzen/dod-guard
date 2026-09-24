// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { LocalGit } from "./local-git.mjs";

const TARGET_BRANCH = "codex/24-complete-pr";
const CURRENT_ROOT = "C:/repo";

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
      const response = takeResponse(responses, command(args));
      if (response instanceof Error) {
        throw response;
      }
      return response;
    },
  };
}

function hasWorktreeCommand(calls) {
  return calls.some((args) => args.includes("worktree"));
}

test("moves a clean current checkout before deleting the merged local branch", () => {
  const fixture = createGitFixture([
    [["branch", "--show-current"], [result(`${TARGET_BRANCH}\n`)]],
    [["show-ref", "--verify", "--quiet", `refs/heads/${TARGET_BRANCH}`], [result(), result("", 1)]],
    [["rev-parse", "--show-toplevel"], [result(`${CURRENT_ROOT}\n`)]],
    [["-C", CURRENT_ROOT, "status", "--porcelain"], [result()]],
    [["fetch", "--no-tags", "origin", "master"], [result()]],
    [["merge-base", "--is-ancestor", "master", "origin/master"], [result()]],
    [["switch", "master"], [result()]],
    [["merge", "--ff-only", "origin/master"], [result()]],
    [["branch", "-d", "--", TARGET_BRANCH], [result()]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master");

  assert.deepEqual(cleanup, { branch: "deleted", currentCheckout: "switched_to_default" });
  assert.equal(hasWorktreeCommand(fixture.calls), false);
});

test("preserves the current branch and dirty files", () => {
  const fixture = createGitFixture([
    [["branch", "--show-current"], [result(`${TARGET_BRANCH}\n`)]],
    [["show-ref", "--verify", "--quiet", `refs/heads/${TARGET_BRANCH}`], [result()]],
    [["rev-parse", "--show-toplevel"], [result(`${CURRENT_ROOT}\n`)]],
    [["-C", CURRENT_ROOT, "status", "--porcelain"], [result(" M user-work.txt\n")]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master");

  assert.deepEqual(cleanup, { branch: "retained_dirty", currentCheckout: "unchanged" });
  assert.equal(hasWorktreeCommand(fixture.calls), false);
  assert.equal(fixture.calls.some((args) => args[0] === "switch" || (args[0] === "branch" && args[1] === "-d")), false);
});

test("retains a local branch when Git refuses deletion", () => {
  const fixture = createGitFixture([
    [["branch", "--show-current"], [result("master\n")]],
    [["show-ref", "--verify", "--quiet", `refs/heads/${TARGET_BRANCH}`], [result(), result()]],
    [["branch", "-d", "--", TARGET_BRANCH], [new Error("branch is checked out elsewhere")]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master");

  assert.deepEqual(cleanup, { branch: "delete_refused", currentCheckout: "unchanged" });
  assert.equal(hasWorktreeCommand(fixture.calls), false);
});

test("dry run describes current-checkout cleanup without mutating Git", () => {
  const fixture = createGitFixture([
    [["branch", "--show-current"], [result(`${TARGET_BRANCH}\n`)]],
    [["show-ref", "--verify", "--quiet", `refs/heads/${TARGET_BRANCH}`], [result()]],
    [["rev-parse", "--show-toplevel"], [result(`${CURRENT_ROOT}\n`)]],
    [["-C", CURRENT_ROOT, "status", "--porcelain"], [result()]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master", { dryRun: true });

  assert.deepEqual(cleanup, { branch: "would_delete", currentCheckout: "would_switch_to_default" });
  assert.equal(hasWorktreeCommand(fixture.calls), false);
  assert.equal(fixture.calls.some((args) => ["fetch", "switch", "merge"].includes(args[0]) || (args[0] === "branch" && args[1] === "-d")), false);
});

test("does not delete a missing local branch", () => {
  const fixture = createGitFixture([
    [["branch", "--show-current"], [result("master\n")]],
    [["show-ref", "--verify", "--quiet", `refs/heads/${TARGET_BRANCH}`], [result("", 1)]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master");

  assert.deepEqual(cleanup, { branch: "already_absent", currentCheckout: "unchanged" });
  assert.equal(hasWorktreeCommand(fixture.calls), false);
});

test("preserves the local branch when the default branch cannot fast-forward", () => {
  const fixture = createGitFixture([
    [["branch", "--show-current"], [result(`${TARGET_BRANCH}\n`)]],
    [["show-ref", "--verify", "--quiet", `refs/heads/${TARGET_BRANCH}`], [result()]],
    [["rev-parse", "--show-toplevel"], [result(`${CURRENT_ROOT}\n`)]],
    [["-C", CURRENT_ROOT, "status", "--porcelain"], [result()]],
    [["fetch", "--no-tags", "origin", "master"], [result()]],
    [["merge-base", "--is-ancestor", "master", "origin/master"], [result("", 1)]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master");

  assert.deepEqual(cleanup, { branch: "switch_refused", currentCheckout: "unchanged" });
  assert.equal(hasWorktreeCommand(fixture.calls), false);
  assert.equal(fixture.calls.some((args) => args[0] === "switch"), false);
  assert.equal(fixture.calls.some((args) => args[0] === "branch" && args[1] === "-d"), false);
});

test("restores the feature checkout if fast-forward fails after the switch", () => {
  const fixture = createGitFixture([
    [["branch", "--show-current"], [result(`${TARGET_BRANCH}\n`)]],
    [["show-ref", "--verify", "--quiet", `refs/heads/${TARGET_BRANCH}`], [result()]],
    [["rev-parse", "--show-toplevel"], [result(`${CURRENT_ROOT}\n`)]],
    [["-C", CURRENT_ROOT, "status", "--porcelain"], [result()]],
    [["fetch", "--no-tags", "origin", "master"], [result()]],
    [["merge-base", "--is-ancestor", "master", "origin/master"], [result()]],
    [["switch", "master"], [result()]],
    [["merge", "--ff-only", "origin/master"], [new Error("not a fast-forward")]],
    [["switch", TARGET_BRANCH], [result()]],
  ]);
  const git = new LocalGit(fixture.runner);

  const cleanup = git.cleanupBranch(TARGET_BRANCH, "master");

  assert.deepEqual(cleanup, { branch: "switch_refused", currentCheckout: "unchanged" });
  assert.equal(hasWorktreeCommand(fixture.calls), false);
  assert.equal(fixture.calls.some((args) => args[0] === "branch" && args[1] === "-d"), false);
});
