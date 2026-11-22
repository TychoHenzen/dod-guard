import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { BEGIN, END, install, merge } from "./install.mjs";

const SCRIPT = fileURLToPath(new URL("./install.mjs", import.meta.url));
const SHIPPED = fileURLToPath(new URL("../standards", import.meta.url));
const DAMAGED = /build\.md: the dod-guard markers are damaged/;
const MISSING_REPO = /missing --repo/;
const NON_ASCII = /[^\x09\x0a\x0d\x20-\x7e]/;
let source;
let repo;

function write(root, path, text) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
}

function read(path) {
  return readFileSync(join(repo, path), "utf8");
}

beforeEach(() => {
  source = mkdtempSync(join(tmpdir(), "standards-src-"));
  repo = mkdtempSync(join(tmpdir(), "standards-repo-"));
  write(source, "engineering.md", "## eng\n\n- one\n");
  write(source, "policy/build.md", "## build\n");
  write(source, "policy/triage.md", "## triage\n");
});

afterEach(() => {
  rmSync(source, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

test("an empty repository gets every file under .archon", () => {
  const result = install({ source, repo });

  assert.deepEqual(result, [
    { path: ".archon/engineering.md", action: "created" },
    { path: ".archon/sdlc/policy/build.md", action: "created" },
    { path: ".archon/sdlc/policy/triage.md", action: "created" },
  ]);
  assert.equal(read(".archon/sdlc/policy/build.md"), `${BEGIN}\n## build\n${END}\n`);
});

test("a root engineering.md takes the block instead of gaining a rival", () => {
  write(repo, "engineering.md", "# Ours\n\n- keep me\n");

  install({ source, repo });

  assert.equal(read("engineering.md"), `# Ours\n\n- keep me\n\n${BEGIN}\n## eng\n\n- one\n${END}\n`);
  assert.equal(existsSync(join(repo, ".archon", "engineering.md")), false);
});

test("a rerun replaces only the block and keeps the project's own lines", () => {
  write(repo, ".archon/sdlc/policy/build.md", `# Project\n\n${BEGIN}\nold\n${END}\n- project line\n`);

  install({ source, repo });

  assert.equal(read(".archon/sdlc/policy/build.md"), `# Project\n\n${BEGIN}\n## build\n${END}\n- project line\n`);
});

test("a second run changes nothing", () => {
  install({ source, repo });

  const result = install({ source, repo });

  assert.ok(result.every((entry) => entry.action === "unchanged"));
});

test("a CRLF file keeps CRLF line endings", () => {
  const merged = merge("# Ours\r\n", "## build\n- a\n");

  assert.equal(merged, `# Ours\r\n\r\n${BEGIN}\r\n## build\r\n- a\r\n${END}\r\n`);
});

test("damaged markers stop the run before any file is written", () => {
  write(repo, ".archon/sdlc/policy/build.md", `${BEGIN}\nno end marker\n`);

  assert.throws(() => install({ source, repo }), DAMAGED);
  assert.equal(existsSync(join(repo, ".archon", "engineering.md")), false);
});

test("a missing option exits 2 from the command line", () => {
  const result = spawnSync(process.execPath, [SCRIPT, `--source=${source}`], { encoding: "utf8" });

  assert.equal(result.status, 2);
  assert.match(result.stderr, MISSING_REPO);
});

test("the shipped standards are plain ASCII", () => {
  for (const path of ["engineering.md", "policy/build.md", "policy/triage.md"]) {
    assert.doesNotMatch(readFileSync(join(SHIPPED, path), "utf8"), NON_ASCII, path);
  }
});
