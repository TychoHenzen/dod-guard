// Every check in plugin-checks.mjs must genuinely fail, not just genuinely
// pass. The predicate that answers "does git track this file" is injected
// here as a fake, because a fixture that leaves a real file untracked in this
// repo would be absent from a clone, existsSync would filter it out, and the
// rule would pass vacuously without ever being tested.

import { deepStrictEqual, match, strictEqual } from "node:assert";
import { rmSync } from "node:fs";
import { after, describe, it } from "node:test";
import { buildPkg, goodTree } from "./fixtures/plugin-tracked.mjs";
import { createPluginChecks } from "./lib/plugin-checks.mjs";

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function tree() {
  const root = goodTree();
  temps.push(root);
  return root;
}

function collect(pkg, isTracked) {
  const violations = [];
  const { checkPackage } = createPluginChecks((file, message) => violations.push({ file, message }), isTracked);
  checkPackage(pkg, [pkg]);
  return violations;
}

const alwaysTracked = () => true;

describe("validate-plugins: git-tracked rules", () => {
  it("reports nothing on a clean tree with everything tracked", () => {
    const root = tree();
    const pkg = buildPkg(root);
    deepStrictEqual(collect(pkg, alwaysTracked), []);
  });

  it("fails when the bundle exists but is not tracked by git", () => {
    const root = tree();
    const pkg = buildPkg(root);
    const isTracked = (file) => file !== pkg.bundle;
    const violations = collect(pkg, isTracked);
    strictEqual(violations.length, 1, JSON.stringify(violations));
    match(violations[0].message, /dist\/bundle\.js not tracked by git/);
  });

  it("fails when the bundle is missing from disk entirely", () => {
    const root = tree();
    const pkg = buildPkg(root);
    rmSync(pkg.bundle);
    const violations = collect(pkg, alwaysTracked);
    strictEqual(violations.length, 1, JSON.stringify(violations));
    match(violations[0].message, /dist\/bundle\.js missing/);
  });

  it("fails when a hook command targets a file git does not track", () => {
    const root = tree();
    const pkg = buildPkg(root);
    const isTracked = (file) => file !== pkg.hookScript;
    const violations = collect(pkg, isTracked);
    strictEqual(violations.length, 1, JSON.stringify(violations));
    match(violations[0].message, /hook command targets untracked file/);
  });
});
