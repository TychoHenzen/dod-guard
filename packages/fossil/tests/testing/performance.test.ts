import assert from "node:assert/strict";
import { test } from "node:test";
import {
  benchmarkPerformanceFixture,
  createPerformanceFixture,
  fastImportStream,
  MAXIMUM_PERFORMANCE_DURATION_MS,
  performanceBenchmarkJson,
  TARGET_PERFORMANCE_FIXTURE,
} from "./performance.js";
import "./performance-real.cases.js";

async function runTargetBenchmark() {
  const input = fastImportStream(TARGET_PERFORMANCE_FIXTURE);
  const commitRecords = input.match(/^commit refs\/heads\/main$/gm) ?? [];
  const sourcePaths = new Set(
    [...input.matchAll(/^M 100644 inline (src\/[^\n]+)$/gm)].map(
      (match) => match[1],
    ),
  );
  const timestamps = [0, 9_999, 10_000, 19_999, 20_000, 29_999];
  const calls: string[] = [];

  const result = await benchmarkPerformanceFixture(
    {
      root: "C:/fixture",
      ...TARGET_PERFORMANCE_FIXTURE,
      cleanup: async () => undefined,
    },
    {
      runFreshJsonAnalysis: async (repositoryPath) => {
        calls.push(repositoryPath);
      },
      now: () => timestamps.shift() ?? 0,
    },
  );
  return { commitRecords, sourcePaths, calls, result };
}

async function assertExceededBenchmark(): Promise<void> {
  await assert.rejects(
    benchmarkPerformanceFixture(
      {
        root: "C:/fixture",
        ...TARGET_PERFORMANCE_FIXTURE,
        cleanup: async () => undefined,
      },
      {
        runFreshJsonAnalysis: async () => undefined,
        now: (() => {
          const exceedingTimestamps = [0, MAXIMUM_PERFORMANCE_DURATION_MS];
          return () => exceedingTimestamps.shift() ?? 0;
        })(),
      },
    ),
    /exceeded 10000 ms/,
  );
}

test(
  "defines the target fixture and enforces three fresh JSON analysis runs " +
    "below ten seconds",
  async () => {
    const target = await runTargetBenchmark();
    assert.equal(target.commitRecords.length, 5_000);
    assert.equal(target.sourcePaths.size, 1_000);
    assert.deepEqual(target.calls, [
      "C:/fixture",
      "C:/fixture",
      "C:/fixture",
      "C:/fixture",
    ]);
    assert.deepEqual(target.result, {
      durationsMs: [9_999, 9_999, 9_999],
      maximumDurationMs: 9_999,
    });
    assert.deepEqual(
      JSON.parse(performanceBenchmarkJson(target.result)),
      target.result,
    );
    await assertExceededBenchmark();
  },
);
