import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { test } from "node:test";
import { gate } from "./quality-guard-gate.mjs";
import * as fixtures from "./git-tracked-adoption-fixtures.test.mjs";

function regressionServices(overrides = {}) {
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
    ...overrides,
  });
}

test("a blocked regression checks the waiver before the linter", () => {
  const root = fixtures.tempRepo();
  const filePath = fixtures.writeTarget(root, "tracked.js", 10);
  fixtures.writeBaselineFile(root, ["tracked.js"], {});
  const calls = [];
  const code = gate(
    fixtures.fakeInput(filePath),
    filePath,
    regressionServices({
      runScanner: () => {
        calls.push("scanner");
        return { violations: [{ rule: "todo-marker", severity: "error" }] };
      },
      readBaseline: () => {
        calls.push("baseline");
        return {};
      },
      compareToBaseline: () => {
        calls.push("comparison");
        return {
          newFiles: [],
          regressions: [{ file: "tracked.js", rule: "todo-marker" }],
        };
      },
      readSentinelState: () => {
        calls.push("sentinel");
        return { rebaseline: false };
      },
      waive: () => {
        calls.push("waive");
        return false;
      },
      localResult: () => {
        calls.push("linter");
        return 0;
      },
    }),
  );
  assert.equal(code, 2);
  assert.deepEqual(calls, [
    "scanner",
    "baseline",
    "comparison",
    "sentinel",
    "waive",
  ]);
  rmSync(root, { recursive: true, force: true });
});
