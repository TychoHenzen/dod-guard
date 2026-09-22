import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { gate } from "../../scripts/quality-guard-gate.mjs";
import {
  FILE_RULES,
  runScanner,
} from "../../scripts/quality-guard-gate-scan.mjs";
import {
  fakeInput,
  gateDeps,
  tempRepo,
  writeTarget,
} from "./git-tracked-adoption-fixtures.test.mjs";

function testTarget(name) {
  const root = tempRepo();
  return { root, filePath: writeTarget(root, name, 10) };
}

function gateWith(filePath, calls, scan) {
  return gate(
    fakeInput(filePath),
    filePath,
    gateDeps({
      runScanner: () => {
        calls.push("scanner");
        return scan;
      },
      localResult: () => {
        calls.push("linter");
        return 0;
      },
    }),
  );
}

test("a scanner failure fails open before the linter runs", () => {
  const { root, filePath } = testTarget("scanner-failure.js");
  const calls = [];
  const code = gateWith(filePath, calls, null);
  assert.equal(code, 0);
  assert.deepEqual(calls, ["scanner"]);
  rmSync(root, { recursive: true, force: true });
});

test("the file-local rule set excludes project reachability rules", () => {
  assert.match(FILE_RULES, /file-length/);
  assert.match(FILE_RULES, /wildcard-import/);
  assert.doesNotMatch(FILE_RULES, /duplicate-block/);
  assert.doesNotMatch(FILE_RULES, /dead-export/);
  assert.doesNotMatch(FILE_RULES, /test-only-export/);
});

test("the file-local scanner reports Python wildcard imports", () => {
  const root = tempRepo();
  const filePath = writeTarget(root, "wild.py", 1);
  writeFileSync(filePath, "from package import *\n");
  try {
    const scan = runScanner(filePath, root);
    assert.ok(
      scan?.violations.some(
        (violation) => violation.rule === "wildcard-import",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the project linter runs after a passing structural check", () => {
  const { root, filePath } = testTarget("clean.js");
  const calls = [];
  const code = gateWith(filePath, calls, { violations: [] });
  assert.equal(code, 0);
  assert.deepEqual(calls, ["scanner", "linter"]);
  rmSync(root, { recursive: true, force: true });
});
