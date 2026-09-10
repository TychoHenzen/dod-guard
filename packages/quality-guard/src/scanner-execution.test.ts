import assert from "node:assert/strict";
import { test } from "node:test";
import { runScan } from "./scanner.js";

test("runScan parses the scanner report on success", () => {
  const fake = () => JSON.stringify({ summary: { total: 0 }, violations: [] });
  const result = runScan({ paths: ["src"] }, fake as never);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report, { summary: { total: 0 }, violations: [] });
});

test("runScan treats a non-zero exit as a verdict, not a crash", () => {
  const fake = () => {
    const err = new Error("Command failed") as Error & {
      status: number;
      stdout: string;
    };
    err.status = 1;
    err.stdout = JSON.stringify({
      comparison: { regressions: [{ file: "a.ts" }] },
    });
    throw err;
  };
  const result = runScan(
    { paths: ["src"], failOn: "regression" },
    fake as never,
  );
  assert.equal(
    result.exitCode,
    1,
    "a failed gate must still return its report",
  );
  assert.deepEqual(result.report, {
    comparison: { regressions: [{ file: "a.ts" }] },
  });
});

test("runScan throws when the scanner produced no report at all", () => {
  const fake = () => {
    throw new Error("spawn ENOENT");
  };
  assert.throws(
    () => runScan({ paths: ["src"] }, fake as never),
    /quality scan failed: spawn ENOENT/,
  );
});
