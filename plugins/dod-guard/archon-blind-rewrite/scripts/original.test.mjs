import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { materialize } from "./original.mjs";

const SCRIPT = fileURLToPath(new URL("./original.mjs", import.meta.url));
const UNTRACKED = /no tracked file at missing/;
const MISSING_COMMIT = /missing --commit/;
let repo;
let commit;

function git(...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), "original-"));
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  git("config", "core.autocrlf", "false");
  mkdirSync(join(repo, "component", "inner"), { recursive: true });
  writeFileSync(join(repo, "component", "module.js"), "export const a = 1;\r\n");
  writeFileSync(join(repo, "component", "inner", "util.js"), "export const $Format:%H$ = 2;\n");
  writeFileSync(
    join(repo, ".gitattributes"),
    "component/module.js export-ignore\ncomponent/inner/util.js export-subst\n",
  );
  git("add", "-A");
  git("commit", "-q", "-m", "start");
  commit = git("rev-parse", "HEAD");
});

after(() => rmSync(repo, { recursive: true, force: true }));

test("export attributes do not drop or rewrite files", () => {
  const dir = mkdtempSync(join(tmpdir(), "original-out-"));
  try {
    assert.equal(materialize({ commit, target: "component", dir, cwd: repo }), 2);
    assert.equal(readFileSync(join(dir, "component", "module.js"), "utf8"), "export const a = 1;\r\n");
    assert.equal(readFileSync(join(dir, "component", "inner", "util.js"), "utf8"), "export const $Format:%H$ = 2;\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a single file target is written at its repository path", () => {
  const dir = mkdtempSync(join(tmpdir(), "original-out-"));
  try {
    assert.equal(materialize({ commit, target: "component/module.js", dir, cwd: repo }), 1);
    assert.equal(readFileSync(join(dir, "component", "module.js"), "utf8"), "export const a = 1;\r\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an untracked target exits 2 from the command line", () => {
  const dir = mkdtempSync(join(tmpdir(), "original-out-"));
  try {
    const result = spawnSync(process.execPath, [SCRIPT, `--commit=${commit}`, "--target=missing", `--dir=${dir}`], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, UNTRACKED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing option exits 2 from the command line", () => {
  const result = spawnSync(process.execPath, [SCRIPT, "--target=component"], { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, MISSING_COMMIT);
});
