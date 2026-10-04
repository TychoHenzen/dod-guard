import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { gate } from "../../scripts/quality-guard-gate.mjs";
import { findRepoRoot } from "../../scripts/quality-guard-gate-scan.mjs";
import {
  fakeInput,
  gateDeps,
  tempRepo,
  testTarget,
} from "./git-tracked-adoption-fixtures.test.mjs";

test("repository discovery reaches roots beyond forty directory levels", () => {
  const root = tempRepo();
  const filePath = join(
    root,
    ...Array.from({ length: 41 }, (_, index) => `level-${index}`),
    "deep.js",
  );
  assert.equal(findRepoRoot(filePath), root);
  rmSync(root, { recursive: true, force: true });
});

function captureOutput(run) {
  let stdout = "";
  let stderr = "";
  const originalStdout = process.stdout.write;
  const originalWrite = process.stderr.write;
  process.stdout.write = (chunk) => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += String(chunk);
    return true;
  };
  try {
    const value = run();
    return { output: `${stdout}${stderr}`, stdout, stderr, value };
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalWrite;
  }
}

test("a scanner failure reports unavailable evidence and fails open", () => {
  const { root, filePath } = testTarget("scanner-failure.js");
  const calls = [];
  const result = captureOutput(() =>
    gate(
      fakeInput(filePath),
      filePath,
      gateDeps({
        runScanner: () => {
          calls.push("scanner");
          return null;
        },
      }),
    ),
  );
  assert.equal(result.value, 0);
  assert.deepEqual(calls, ["scanner"]);
  assert.match(result.output, /advisory unavailable/);
  assert.match(result.output, /scanner did not return a readable report/);
  rmSync(root, { recursive: true, force: true });
});

test("a project-linter failure reports unavailable evidence and fails open", () => {
  const { root, filePath } = testTarget("linter-failure.js");
  const result = captureOutput(() =>
    gate(
      fakeInput(filePath),
      filePath,
      gateDeps({
        runScanner: () => ({ violations: [] }),
        localResult: () => {
          throw new Error("linter unavailable");
        },
      }),
    ),
  );
  assert.equal(result.value, 0);
  assert.match(result.output, /project-linter failed: linter unavailable/);
  rmSync(root, { recursive: true, force: true });
});
