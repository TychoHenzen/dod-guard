// The content checks must count what a clean checkout would ship. A leftover or
// build directory that git ignores must not change the counts or add violations.

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { checkJsonSyntax, checkShippedContent, listCheckedFiles } from "./lib/content-checks.mjs";
import { toPosix } from "./lib/fs-utils.mjs";

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function put(root, relativePath, text) {
  const file = join(root, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

// tracked: packages/real/a.json and a tracked file under dist/. ignored:
// packages/ghost/ with malformed JSON. untracked and not ignored: plugins/fresh/c.md.
// cached but deleted from disk: packages/real/gone.json, which must be dropped.
function repository() {
  const root = mkdtempSync(join(tmpdir(), "content-checks-"));
  temps.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  put(root, ".gitignore", "packages/ghost/\n");
  put(root, "packages/real/a.json", "{}\n");
  put(root, "packages/real/dist/d.json", "{}\n");
  put(root, "packages/real/gone.json", "{}\n");
  put(root, "packages/ghost/b.json", "{not json");
  put(root, "packages/ghost/notes.md", "# ghost\n");
  execFileSync("git", ["add", ".gitignore", "packages/real"], { cwd: root });
  rmSync(join(root, "packages/real/gone.json"));
  put(root, "plugins/fresh/c.md", "# fresh\n");
  return root;
}

describe("content-checks: the checked file set", () => {
  it("omits ignored, deleted, and dist files and keeps untracked unignored files", () => {
    const root = repository();
    const violations = [];
    const files = listCheckedFiles(root, (file, message) => violations.push({ file, message }));
    deepStrictEqual(violations, []);
    deepStrictEqual(files.map((file) => toPosix(root, file)).sort(), [
      ".gitignore",
      "packages/real/a.json",
      "plugins/fresh/c.md",
    ]);
  });

  it("counts and validates only that set, so ignored malformed JSON is not reported", () => {
    const root = repository();
    const violations = [];
    const report = (file, message) => violations.push({ file, message });
    const files = listCheckedFiles(root, report);
    strictEqual(checkJsonSyntax(root, report, files), 1);
    strictEqual(checkShippedContent(root, report, files), 2);
    deepStrictEqual(violations, []);
  });

  it("reports and returns null when git cannot list the files", () => {
    const root = mkdtempSync(join(tmpdir(), "content-checks-nogit-"));
    temps.push(root);
    const violations = [];
    const files = listCheckedFiles(join(root, "missing"), (file, message) => violations.push({ file, message }));
    strictEqual(files, null);
    strictEqual(violations.length, 1);
  });
});
