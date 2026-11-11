import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import test from "node:test";
import { pullRequest } from "./quality-pr-gate-cli-test-support.mjs";

const TREE_MODULE = new URL(
  "../../../../../skills/quality-refactor/scripts/lib/merge-base-tree.mjs",
  import.meta.url,
);
const { exportTree } = await import(TREE_MODULE.href);

const TMP_VARS = ["TMPDIR", "TEMP", "TMP"];

// os.tmpdir() reads these variables on every call, so pointing them at a
// private directory shows exactly what exportTree leaves behind.
function inTmp(dir, run) {
  const saved = Object.fromEntries(TMP_VARS.map((k) => [k, process.env[k]]));
  for (const key of TMP_VARS) process.env[key] = dir;
  try {
    return run();
  } finally {
    for (const key of TMP_VARS) {
      delete process.env[key];
      if (saved[key] !== undefined) process.env[key] = saved[key];
    }
  }
}

function twoCommitRepo(t) {
  return pullRequest(t, {
    base: { "src/a.js": "export const a = 1;\n", "keep/b.txt": "b\n" },
    head: { "src/a.js": "export const a = 2;\n" },
  });
}

test("exportTree writes the commit's files and leaves the index alone", (t) => {
  const repo = twoCommitRepo(t);
  const indexBefore = readFileSync(join(repo, ".git", "index"));
  const { dir, cleanup } = exportTree(repo, "main");
  t.after(cleanup);
  // A Windows checkout may turn the line endings into CRLF.
  const text = (rel) => readFileSync(join(dir, rel), "utf8").replace(/\r/g, "");
  assert.equal(text("src/a.js"), "export const a = 1;\n");
  assert.equal(text("keep/b.txt"), "b\n");
  assert.equal(existsSync(join(dir, ".git")), false);
  assert.ok(readFileSync(join(repo, ".git", "index")).equals(indexBefore));
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: repo,
    encoding: "utf8",
  });
  assert.equal(status.stdout, "");
});

test("cleanup removes the exported tree and its private parent", (t) => {
  const { dir, cleanup } = exportTree(twoCommitRepo(t), "main");
  assert.equal(existsSync(join(dir, "src/a.js")), true);
  cleanup();
  assert.equal(existsSync(dir), false);
  assert.equal(existsSync(dirname(dir)), false);
});

test("a failed export throws and leaves no private directory", (t) => {
  const repo = twoCommitRepo(t);
  const scratch = mkdtempSync(join(tmpdir(), "merge-base-tree-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  inTmp(scratch, () => {
    assert.throws(
      () => exportTree(repo, "no-such-rev"),
      /git read-tree failed/,
    );
  });
  assert.deepEqual(readdirSync(scratch), []);
});
