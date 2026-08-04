import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { EvoError } from "./evo-error.js";
import {
  activeBranch,
  branchExists,
  branchNames,
  evoTags,
  git,
  gitTry,
  initializedRoot,
  resolveRoot,
  restoreAside,
  rootBranchOf,
  setAside,
  statusLines,
  tagDescription,
} from "./evo-git.js";

function repo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitevo-git-"));
  for (const args of [["init"], ["config", "user.name", "test"], ["config", "user.email", "t@t.com"]]) {
    spawnSync("git", args, { cwd: dir, encoding: "utf-8" });
  }
  fs.writeFileSync(path.join(dir, "file.txt"), "hello");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "initial"], { cwd: dir });
  return dir;
}

describe("git process", () => {
  it("returns trimmed stdout", () => assert.equal(git(["rev-parse", "--is-inside-work-tree"], repo()), "true"));
  it("throws EvoError on a failing command", () => {
    assert.throws(() => git(["rev-parse", "--verify", "nope"], repo()), EvoError);
  });
  it("answers null instead of throwing", () => {
    assert.equal(gitTry(["rev-parse", "--verify", "nope"], repo()), null);
  });
});

describe("repository location", () => {
  it("refuses a directory outside any repository", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "gitevo-plain-"));
    assert.throws(
      () => resolveRoot(plain),
      (err: Error) => err.message === "Not a git repository. Run 'git init' first.",
    );
  });

  it("resolves the top level from a nested directory", () => {
    const dir = repo();
    const nested = path.join(dir, "packages", "deep");
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(resolveRoot(nested), resolveRoot(dir));
  });

  it("refuses until evo_init has run", () => {
    const dir = repo();
    assert.throws(
      () => initializedRoot(dir),
      (err: Error) => err.message === "GitEvo not initialized. Run evo_init first.",
    );
    fs.mkdirSync(path.join(dir, ".evo"));
    assert.equal(initializedRoot(dir), resolveRoot(dir));
  });
});

describe("reading the repository", () => {
  it("expands an untracked directory into its files", () => {
    const dir = repo();
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src", "a.ts"), "export {};");
    assert.ok(statusLines(dir).some((line) => line.includes("src/a.ts")));
  });

  it("names the active branch and the branches beside it", () => {
    const dir = repo();
    git(["branch", "side"], dir);
    assert.equal(activeBranch(dir), rootBranchOf(dir));
    assert.ok(branchNames(dir).includes("side"));
    assert.ok(branchExists(dir, "side"));
    assert.ok(!branchExists(dir, "absent"));
  });

  it("lists evo tags and reads only annotated bodies", () => {
    const dir = repo();
    git(["tag", "-a", "evo-one", "-m", "the first mark"], dir);
    git(["tag", "evo-two"], dir);
    assert.deepEqual(evoTags(dir), ["evo-one", "evo-two"]);
    assert.equal(tagDescription(dir, "evo-one"), "the first mark");
    assert.equal(tagDescription(dir, "evo-two"), "");
  });
});

describe("setting changes aside", () => {
  it("stashes and restores uncommitted work", () => {
    const dir = repo();
    fs.writeFileSync(path.join(dir, "file.txt"), "dirty");
    const held = setAside(dir, statusLines(dir));
    assert.ok(held);
    assert.deepEqual(statusLines(dir), []);
    assert.equal(restoreAside(dir, held), "");
    assert.equal(fs.readFileSync(path.join(dir, "file.txt"), "utf-8"), "dirty");
  });

  it("does nothing on a clean tree", () => {
    const dir = repo();
    assert.equal(setAside(dir, statusLines(dir)), false);
    assert.equal(restoreAside(dir, false), "");
  });
});
