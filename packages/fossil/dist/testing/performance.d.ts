import type { PerformanceBenchmarkDependencies } from "./performance-types/performance-benchmark-dependencies.js";
import type { PerformanceBenchmarkResult } from "./performance-types/performance-benchmark-result.js";
import type { PerformanceFixture } from "./performance-types/performance-fixture.js";
export type { PerformanceBenchmarkDependencies, PerformanceBenchmarkResult, PerformanceFixture, PerformanceFixtureSpec, } from "./performance-types/index.js";
export { MAXIMUM_PERFORMANCE_DURATION_MS, TARGET_PERFORMANCE_COMMIT_COUNT, TARGET_PERFORMANCE_FILE_COUNT, TARGET_PERFORMANCE_FIXTURE, } from "./performance-constants.js";
export { createPerformanceFixture, fastImportStream } from "./performance-fixture.js";
/** Warms once, measures three fresh JSON-analysis calls, and rejects any run at or above ten seconds. */
export declare function benchmarkPerformanceFixture(fixture: PerformanceFixture, { runFreshJsonAnalysis, now }: PerformanceBenchmarkDependencies): Promise<PerformanceBenchmarkResult>;
/** Encodes benchmark durations and the maximum as the CI artifact document. */
export declare function performanceBenchmarkJson(result: PerformanceBenchmarkResult): string;
