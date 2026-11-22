import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectFiles } from "../../../../../skills/quality-refactor/scripts/lib/walk.mjs";
import { writeTree } from "./formatter-width-test-support.mjs";

function kept(t, excludes, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "walk-exclude-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeTree(root, {
    "src/a.js": "x();\n",
    "samples/b.js": "x();\n",
    "pkg/samples/c.js": "x();\n",
    ...extra,
  });
  return collectFiles([root], root, excludes)
    .map((file) => file.rel)
    .sort();
}

test("a leading-slash entry removes a root-level directory", (t) => {
  const files = kept(t, ["/samples/"]);
  assert.ok(!files.includes("samples/b.js"), JSON.stringify(files));
});

test("a leading-slash entry removes a nested directory", (t) => {
  const files = kept(t, ["/samples/"]);
  assert.ok(!files.includes("pkg/samples/c.js"), JSON.stringify(files));
});

test("an entry without a slash keeps its substring meaning", (t) => {
  assert.deepEqual(kept(t, ["amples/"]), ["src/a.js"]);
});

test("a leading-slash entry does not match inside a longer name", (t) => {
  const files = kept(t, ["/samples/"], { "mysamples/d.js": "x();\n" });
  assert.ok(files.includes("mysamples/d.js"), JSON.stringify(files));
  assert.ok(files.includes("src/a.js"), JSON.stringify(files));
});
