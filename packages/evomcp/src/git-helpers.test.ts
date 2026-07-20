import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

// ── Mock state (shared across both helper functions) ────────────────────────

let gitFail = false;
let gitErrorMsg = "nothing to commit, working tree clean";
let branchListOutput = "";

mock.module("node:child_process", {
  namedExports: {
    execSync: mock.fn((cmd: string, _opts?: any) => {
      if (gitFail) {
        const err = new Error(gitErrorMsg);
        (err as any).status = 1;
        throw err;
      }
      if (cmd.startsWith("git branch --format")) {
        return branchListOutput;
      }
      return "";
    }),
  },
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("commitOrNoop", () => {
  let commitOrNoop: (cwd: string, message: string) => { committed: boolean };

  before(async () => {
    const mod = await import("./git-helpers.js");
    commitOrNoop = mod.commitOrNoop;
  });

  it("returns { committed: true } on successful commit", () => {
    gitFail = false;
    const result = commitOrNoop("/test", "my message");
    assert.deepEqual(result, { committed: true });
  });

  it("returns { committed: false } on nothing to commit", () => {
    gitFail = true;
    gitErrorMsg = "nothing to commit, working tree clean";
    const result = commitOrNoop("/test", "my message");
    assert.deepEqual(result, { committed: false });
  });

  it("returns { committed: false } on nothing added to commit", () => {
    gitFail = true;
    gitErrorMsg = "nothing added to commit but untracked files present";
    const result = commitOrNoop("/test", "my message");
    assert.deepEqual(result, { committed: false });
  });

  it("re-throws non-noop git errors", () => {
    gitFail = true;
    gitErrorMsg = "fatal: not a git repository";
    assert.throws(() => commitOrNoop("/test", "msg"), {
      message: /fatal: not a git repository/,
    });
  });
});

describe("getRootBranch", () => {
  let getRootBranch: (cwd: string) => string;

  before(async () => {
    const mod = await import("./git-helpers.js");
    getRootBranch = mod.getRootBranch;
  });

  it("returns master when master exists", () => {
    gitFail = false;
    branchListOutput = "master\nmain\ndevelop\nfeature-x\n";
    assert.equal(getRootBranch("/test"), "master");
  });

  it("returns main when no master but main exists", () => {
    gitFail = false;
    branchListOutput = "main\ntrunk\n";
    assert.equal(getRootBranch("/test"), "main");
  });

  it("returns trunk when no master/main", () => {
    gitFail = false;
    branchListOutput = "trunk\ndevelop\nfeature-x\n";
    assert.equal(getRootBranch("/test"), "trunk");
  });

  it("returns develop when no master/main/trunk", () => {
    gitFail = false;
    branchListOutput = "develop\nfeature-x\nfeature-y\n";
    assert.equal(getRootBranch("/test"), "develop");
  });

  it("returns master as default when no common root branch found", () => {
    gitFail = false;
    branchListOutput = "feature-x\nfeature-y\n";
    assert.equal(getRootBranch("/test"), "master");
  });

  it("returns master as default when git command fails", () => {
    gitFail = true;
    gitErrorMsg = "fatal: could not read branches";
    assert.equal(getRootBranch("/test"), "master");
  });
});
