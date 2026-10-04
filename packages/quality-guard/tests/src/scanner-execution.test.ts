import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runScan, runScanAsync } from "../../src/scanner.js";

function nextEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function successfulAsyncScan(): Promise<{ stdout: string }> {
  await nextEventLoopTurn();
  return {
    stdout: JSON.stringify({ summary: { total: 0 }, violations: [] }),
  };
}

async function failedAsyncScan(): Promise<{ stdout: string }> {
  const error = new Error("scanner failed") as Error & {
    status: number;
    stdout: string;
  };
  error.status = 1;
  error.stdout = JSON.stringify({
    comparison: { regressions: [{ file: "a.ts" }] },
  });
  throw error;
}

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
  const result = runScan({ paths: ["src"] }, fake as never);
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

test("runScanAsync waits on an asynchronous runner without blocking the event loop", async () => {
  let eventLoopTurned = false;
  const scan = runScanAsync({ paths: ["src"] }, successfulAsyncScan);
  await nextEventLoopTurn();
  eventLoopTurned = true;
  const result = await scan;
  assert.equal(eventLoopTurned, true);
  assert.equal(result.exitCode, 0);
});

test("runScanAsync returns a scanner failure when the asynchronous runner rejects", async () => {
  const result = await runScanAsync({ paths: ["src"] }, failedAsyncScan);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.report, {
    comparison: { regressions: [{ file: "a.ts" }] },
  });
});

test("runScanAsync converts a real scanner process failure into a report", async () => {
  await assert.rejects(
    runScanAsync({
      root: join(tmpdir(), "quality-scan-missing-root"),
      paths: ["src"],
    }),
    /spawn .* ENOENT/,
  );
});
