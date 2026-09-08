import type {
  PerformanceBenchmarkDependencies,
} from "./performance-types/performance-benchmark-dependencies.js";
import type {
  PerformanceBenchmarkResult,
} from "./performance-types/performance-benchmark-result.js";
import type {
  PerformanceFixture,
} from "./performance-types/performance-fixture.js";
import { MAXIMUM_PERFORMANCE_DURATION_MS } from "./performance-constants.js";

export type {
  PerformanceBenchmarkDependencies,
  PerformanceBenchmarkResult,
  PerformanceFixture,
  PerformanceFixtureSpec,
} from "./performance-types/index.js";

export {
  MAXIMUM_PERFORMANCE_DURATION_MS,
  TARGET_PERFORMANCE_COMMIT_COUNT,
  TARGET_PERFORMANCE_FILE_COUNT,
  TARGET_PERFORMANCE_FIXTURE,
} from "./performance-constants.js";
export {
  createPerformanceFixture,
  fastImportStream,
} from "./performance-fixture.js";

/** Warms once, measures three fresh calls, and rejects slow runs. */
export async function benchmarkPerformanceFixture(
  fixture: PerformanceFixture,
  {
    runFreshJsonAnalysis,
    now = performance.now.bind(performance),
  }: PerformanceBenchmarkDependencies,
): Promise<PerformanceBenchmarkResult> {
  await runFreshJsonAnalysis(fixture.root);
  const durationsMs: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const start = now();
    await runFreshJsonAnalysis(fixture.root);
    const durationMs = now() - start;
    if (durationMs >= MAXIMUM_PERFORMANCE_DURATION_MS)
      throw new Error(
        `JSON analysis exceeded ${MAXIMUM_PERFORMANCE_DURATION_MS} ms: ` +
          `${durationMs} ms`,
      );
    durationsMs.push(durationMs);
  }
  return { durationsMs, maximumDurationMs: Math.max(...durationsMs) };
}

/** Encodes benchmark durations and the maximum as the CI artifact document. */
export function performanceBenchmarkJson(
  result: PerformanceBenchmarkResult,
): string {
  return JSON.stringify(result);
}
