import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import { proxyRemainder } from "./step-plan-proxy.mjs";
import { searchPlans } from "./step-plan-search.mjs";

async function withDirs(use) {
  const base = await mkdtemp(path.join(tmpdir(), "step-plan-faults-"));
  const root = path.join(base, "root");
  const outside = path.join(base, "outside");
  try {
    await mkdir(path.join(root, "lib"), { recursive: true });
    await mkdir(outside);
    await writeFile(path.join(root, "lib", "a.mjs"), "alpha\n");
    await writeFile(path.join(root, "lib", "b.mjs"), "alpha\n");
    await writeFile(path.join(outside, "secret.mjs"), "alpha\n");
    return await use({ root, outside });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

const planFor = (scope, files = []) => ({ task: "T1", files, errors: [], proxies: [{ pattern: "alpha", scope }] });
const searched = (root, plan) => searchPlans([plan], root);
const resultOf = (root, scope) => searched(root, planFor(scope))[0].proxies[0].result;

test("a trailing slash or dot prefix on the scope still yields hit paths a File line can name", () =>
  withDirs(({ root }) => {
    const expected = ["lib/a.mjs", "lib/b.mjs"];
    for (const scope of ["lib/", "./lib", "lib\\", "lib//"]) {
      assert.deepEqual(resultOf(root, scope).hits, expected, scope);
    }
    assert.deepEqual(proxyRemainder(searched(root, planFor("lib/", expected))), []);
  }));

test("a scope outside the checkout root is reported, not searched", () =>
  withDirs(({ root, outside }) => {
    for (const scope of ["..", "../outside", "lib/../../outside", outside]) {
      const result = resultOf(root, scope);
      assert.deepEqual([result.searched, result.hits], [0, []], scope);
      assert.match(result.problems[0], /resolves outside the checkout root/u, scope);
    }
  }));

test("a junction that leads out of the root is reported, not followed", () =>
  withDirs(async ({ root, outside }) => {
    await symlink(outside, path.join(root, "escape"), "junction");
    const result = resultOf(root, "escape");
    assert.deepEqual([result.searched, result.hits], [0, []]);
    assert.match(result.problems[0], /outside the checkout root/u);
  }));

test("a symlinked entry under the scope is reported and skipped", () =>
  withDirs(async ({ root, outside }) => {
    await symlink(outside, path.join(root, "lib", "linked"), "junction");
    const result = resultOf(root, "lib");
    assert.deepEqual(result.hits, ["lib/a.mjs", "lib/b.mjs"]);
    assert.deepEqual(result.problems, ["lib/linked is a symlink and was not searched"]);
    const remainder = proxyRemainder(searched(root, planFor("lib", ["lib/a.mjs", "lib/b.mjs"])));
    assert.equal(remainder.length, 1);
    assert.match(remainder[0], /lib\/linked is a symlink/u);
  }));

// Windows cannot make a file unreadable without admin tools, so the fs call is made to fail for one path.
function denying(method, suffix, code, check) {
  const real = fs[method];
  const stub = mock.method(fs, method, (file, ...rest) => {
    if (String(file).endsWith(suffix)) {
      throw Object.assign(new Error("denied"), { code });
    }
    return real(file, ...rest);
  });
  syncBuiltinESMExports();
  try {
    return check();
  } finally {
    stub.mock.restore();
    syncBuiltinESMExports();
  }
}

test("an unreadable file is reported and the search still returns", () =>
  withDirs(({ root }) =>
    denying("readFileSync", "a.mjs", "EACCES", () => {
      const result = resultOf(root, "lib");
      assert.deepEqual(result.hits, ["lib/b.mjs"]);
      assert.deepEqual(result.problems, ["cannot read lib/a.mjs: EACCES"]);
    })));

test("an unreadable directory is reported and the search still returns", () =>
  withDirs(({ root }) =>
    denying("readdirSync", "lib", "EPERM", () => {
      const result = resultOf(root, "lib");
      assert.deepEqual([result.searched, result.hits], [0, []]);
      assert.deepEqual(result.problems, ["cannot read directory lib: EPERM"]);
    })));
