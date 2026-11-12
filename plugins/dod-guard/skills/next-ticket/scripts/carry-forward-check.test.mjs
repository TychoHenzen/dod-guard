// biome-ignore lint/correctness/noNodejsModules: node:test is the repository's runner
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: the test removes a file through git
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: the test removes its temp repositories
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: node:test is the repository's runner
import { after, test } from "node:test";
import { checkCarryForward } from "./carry-forward-check.mjs";
import { commitFiles, makeRepo } from "./testing/carry-forward-repo.mjs";

const GIT_ARGS = ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"];
const roots = [];
after(() => {
  for (const root of roots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
function repoWith(files) {
  const repo = makeRepo(files);
  roots.push(repo.root);
  return repo;
}
function compare(base, next, paths) {
  const { root, head } = repoWith(base);
  const newHead = commitFiles(root, next);
  return checkCarryForward({ root, baseHead: head, newHead, paths });
}
function editOne(file, before, updated) {
  return compare({ [file]: before }, { [file]: updated }, [file]);
}
function removeFile(root, file) {
  const args = [...GIT_ARGS, "-C", root];
  spawnSync("git", [...args, "rm", "-q", file]);
  spawnSync("git", [...args, "commit", "-q", "-m", "remove"]);
  return spawnSync("git", [...args, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
}

test("passes a comment, blank line and re-indent change", () => {
  const before = "function f() {\n  return 1;\n}\n";
  const updated = "// note\n\nfunction f() {\n    return 1;\n}\n";
  assert.deepEqual(editOne("src/a.mjs", before, updated), { ok: true });
});

test("fails a changed code token and names the path", () => {
  const result = editOne("src/a.mjs", "const b = 2;\n", "const b = 3;\n");
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("src/a.mjs changed code"));
});

test("fails a trailing comment added to a code line", () => {
  const result = editOne("src/a.mjs", "x = 1;\n", "x = 1; // note\n");
  assert.equal(result.ok, false);
});

test("fails an edit inside a template literal", () => {
  const result = editOne("src/a.mjs", "const s = `\n// a\n`;\n", "const s = `\n// b\n`;\n");
  assert.equal(result.ok, false);
});

test("fails a .md path", () => {
  const result = editOne("doc.md", "# Title\n", "# Title\n\nMore.\n");
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes(".md"));
});

test("fails a python re-indent", () => {
  const result = editOne("tool.py", "def f():\n    return 1\n", "def f():\n  return 1\n");
  assert.equal(result.ok, false);
});

test("fails a path missing at the base head", () => {
  const result = compare({ "other.mjs": "x\n" }, { "src/a.mjs": "const a = 1;\n" }, ["src/a.mjs"]);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("is missing at"));
});

test("fails a path missing at the new head", () => {
  const { root, head } = repoWith({ "src/a.mjs": "const a = 1;\n", "other.mjs": "x\n" });
  const newHead = removeFile(root, "src/a.mjs");
  const result = checkCarryForward({ root, baseHead: head, newHead, paths: ["src/a.mjs"] });
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("is missing at"));
});

test("fails a non-sha baseHead", () => {
  const { root, head } = repoWith({ "src/a.mjs": "const a = 1;\n" });
  const result = checkCarryForward({ root, baseHead: "not-a-sha", newHead: head, paths: ["src/a.mjs"] });
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("not a commit sha"));
});

test("fails when both heads are equal", () => {
  const { root, head } = repoWith({ "src/a.mjs": "const a = 1;\n" });
  const result = checkCarryForward({ root, baseHead: head, newHead: head, paths: ["src/a.mjs"] });
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("equals the new head"));
});
