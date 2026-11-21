import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { archonManaged, MAINTAINERS } from "./archon-managed.mjs";

let root;
let origin;
let clone;

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commitToOrigin(path, text) {
  const work = join(root, "work");
  mkdirSync(join(work, path, ".."), { recursive: true });
  writeFileSync(join(work, path), text);
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", `add ${path}`);
  git(work, "push", "-q", "origin", "HEAD:main");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "archon-managed-"));
  origin = join(root, "origin.git");
  git(root, "init", "-q", "--bare", "--initial-branch=main", origin);
  git(root, "init", "-q", "--initial-branch=main", "work");
  const work = join(root, "work");
  git(work, "config", "user.email", "test@example.com");
  git(work, "config", "user.name", "test");
  git(work, "remote", "add", "origin", origin);
  commitToOrigin("README.md", "x\n");
  git(root, "clone", "-q", origin, "clone");
  clone = join(root, "clone");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

test("a default branch without the maintainer list is unmanaged", () => {
  assert.deepEqual(archonManaged({ cwd: clone }), { state: "unmanaged", branch: "main" });
});

test("the maintainer list on the default branch makes it managed, even before a local fetch", () => {
  commitToOrigin(MAINTAINERS, '["someone"]\n');

  assert.deepEqual(archonManaged({ cwd: clone }), { state: "managed", branch: "main", file: MAINTAINERS });
});

test("the list on another branch does not count", () => {
  const work = join(root, "work");
  git(work, "checkout", "-q", "-b", "setup");
  mkdirSync(join(work, ".archon", "sdlc", "policy"), { recursive: true });
  writeFileSync(join(work, MAINTAINERS), "[]\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "setup");
  git(work, "push", "-q", "origin", "setup");

  assert.equal(archonManaged({ cwd: clone }).state, "unmanaged");
});

test("a checkout with no origin cannot tell", () => {
  const lone = join(root, "lone");
  git(root, "init", "-q", lone);

  const result = archonManaged({ cwd: lone });

  assert.equal(result.state, "unknown");
  assert.ok(result.problem.startsWith("cannot read origin"));
});
