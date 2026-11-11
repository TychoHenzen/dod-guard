import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { searchPlans } from "./step-plan-search.mjs";

const FILES = {
  "lib/a.mjs": "alpha\n",
  "lib/b.mjs": "beta alpha\n",
  "other/d.mjs": "alpha\n",
  "node_modules/x/c.mjs": "alpha\n",
  "dist/bundle.js": "alpha\n",
  ".git/HEAD": "alpha\n",
  ".quality/report.json": "alpha\n",
  "coverage/lcov.info": "alpha\n",
};

async function withCheckout(use) {
  const root = await mkdtemp(path.join(tmpdir(), "step-plan-search-"));
  try {
    for (const [name, text] of Object.entries(FILES)) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), text);
    }
    return await use(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const resultOf = (root, pattern, scope) => {
  const plan = { task: "T1", files: [], errors: [], proxies: [{ pattern, scope }] };
  return searchPlans([plan], root)[0].proxies[0].result;
};

test("searches a directory scope by line anchored pattern", () =>
  withCheckout((root) => {
    assert.deepEqual(resultOf(root, "^alpha", "lib"), { searched: 2, hits: ["lib/a.mjs"], problems: [] });
    assert.deepEqual(resultOf(root, "alpha", "lib"), {
      searched: 2,
      hits: ["lib/a.mjs", "lib/b.mjs"],
      problems: [],
    });
  }));

test("skips installed, generated, and report directories when the scope is the whole checkout", () =>
  withCheckout((root) => {
    assert.deepEqual(resultOf(root, "alpha", "."), {
      searched: 3,
      hits: ["lib/a.mjs", "lib/b.mjs", "other/d.mjs"],
      problems: [],
    });
  }));

test("searches a single file scope and reports zero files for a missing scope", () =>
  withCheckout((root) => {
    assert.deepEqual(resultOf(root, "beta", "lib/b.mjs"), { searched: 1, hits: ["lib/b.mjs"], problems: [] });
    assert.deepEqual(resultOf(root, "alpha", "missing"), { searched: 0, hits: [], problems: [] });
  }));
