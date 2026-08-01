import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

interface Call {
  cmd: string;
  opts: Record<string, unknown>;
}

/** Every execSync call, in order. */
const calls: Call[] = [];
let throwOn: string | null = null;
let diffOutput: unknown = "";

/** Every commitOrNoop call, in order. */
const commits: { cwd: string; message: string }[] = [];
let commitThrows = false;

mock.module("node:child_process", {
  namedExports: {
    execSync: mock.fn((cmd: string, opts: Record<string, unknown>) => {
      calls.push({ cmd: String(cmd), opts });
      if (throwOn && String(cmd).startsWith(throwOn)) throw new Error("git said no");
      return diffOutput;
    }),
  },
});

mock.module("./git-helpers.js", {
  namedExports: {
    commitOrNoop: mock.fn((cwd: string, message: string) => {
      commits.push({ cwd, message });
      if (commitThrows) throw new Error("nothing to commit");
      return { committed: true };
    }),
  },
});

describe("solve-git", () => {
  let checkoutBranch: (cwd: string, branch: string) => boolean;
  let captureDiff: (cwd: string, range: string) => string;
  let commitCandidate: (cwd: string, message: string) => void;

  before(async () => {
    const mod = await import("./solve-git.js");
    checkoutBranch = mod.checkoutBranch;
    captureDiff = mod.captureDiff;
    commitCandidate = mod.commitCandidate;
  });

  function reset() {
    calls.length = 0;
    commits.length = 0;
    throwOn = null;
    diffOutput = "";
    commitThrows = false;
  }

  it("checks out the named branch in the given directory", () => {
    reset();
    assert.equal(checkoutBranch("/repo", "solve-strategy-1"), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, "git checkout solve-strategy-1");
    assert.equal(calls[0].opts.cwd, "/repo");
  });

  it("gives up on a checkout after ten seconds and prints nothing", () => {
    reset();
    checkoutBranch("/repo", "topic");
    assert.equal(calls[0].opts.timeout, 10_000);
    assert.equal(calls[0].opts.stdio, "ignore");
  });

  it("reports a checkout git refused as a failure, not an error", () => {
    reset();
    throwOn = "git checkout";
    assert.equal(checkoutBranch("/repo", "missing"), false);
  });

  it("captures the diff of a range as text", () => {
    reset();
    diffOutput = "--- a/x\n+++ b/x\n";
    assert.equal(captureDiff("/repo", "master...topic"), "--- a/x\n+++ b/x\n");
    assert.equal(calls[0].cmd, "git diff master...topic");
    assert.equal(calls[0].opts.encoding, "utf-8");
    assert.equal(calls[0].opts.timeout, 10_000);
  });

  it("returns an empty diff when git fails", () => {
    reset();
    throwOn = "git diff";
    assert.equal(captureDiff("/repo", "master...topic"), "");
  });

  it("returns an empty diff when git prints nothing at all", () => {
    reset();
    diffOutput = null;
    assert.equal(captureDiff("/repo", "master...topic"), "");
  });

  it("commits the working tree with the given message", () => {
    reset();
    commitCandidate("/repo", "solve strategy 1");
    assert.deepEqual(commits, [{ cwd: "/repo", message: "solve strategy 1" }]);
  });

  it("swallows a commit failure, because the empty diff already says so", () => {
    reset();
    commitThrows = true;
    assert.doesNotThrow(() => commitCandidate("/repo", "solve strategy 1"));
    assert.equal(commits.length, 1);
  });
});
