import assert from "node:assert/strict";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { gate } from "./quality-guard-gate.mjs";
import * as fixtures from "./git-tracked-adoption-fixtures.test.mjs";
import { readSkipLog, SENTINEL_NAME } from "./sentinel.mjs";

function regressionServices() {
  return fixtures.gateDeps({
    runScanner: () => ({
      violations: [{ rule: "todo-marker", severity: "error" }],
    }),
    readBaseline: () => ({}),
    compareToBaseline: () => ({
      newFiles: [],
      regressions: [{ file: "tracked.js", rule: "todo-marker" }],
    }),
    localResult: () => 0,
  });
}

test("a plain sentinel cannot waive a tracked regression", () => {
  const root = fixtures.tempRepo();
  const filePath = fixtures.writeTarget(root, "tracked.js", 10);
  fixtures.writeBaselineFile(root, ["tracked.js"], {});
  writeFileSync(join(root, SENTINEL_NAME), "");
  const code = gate(
    fixtures.fakeInput(filePath),
    filePath,
    regressionServices(),
  );
  assert.equal(code, 2);
  assert.equal(existsSync(join(root, SENTINEL_NAME)), true);
  assert.deepEqual(readSkipLog(root), []);
  rmSync(root, { recursive: true, force: true });
});

test("a rebaseline sentinel authorizes a tracked regression", () => {
  const root = fixtures.tempRepo();
  const filePath = fixtures.writeTarget(root, "tracked.js", 10);
  fixtures.writeBaselineFile(root, ["tracked.js"], {});
  writeFileSync(join(root, SENTINEL_NAME), '{"rebaseline": true}');
  const code = gate(
    fixtures.fakeInput(filePath),
    filePath,
    regressionServices(),
  );
  assert.equal(code, 0);
  assert.equal(existsSync(join(root, SENTINEL_NAME)), false);
  assert.equal(readSkipLog(root)[0]?.rebaseline, true);
  rmSync(root, { recursive: true, force: true });
});
