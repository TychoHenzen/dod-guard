import type { PerformanceBenchmarkDependencies, PerformanceBenchmarkResult, PerformanceFixture } from "./performance-types/index.js";
export type { PerformanceBenchmarkDependencies, PerformanceBenchmarkResult, PerformanceFixture, PerformanceFixtureSpec, } from "./performance-types/index.js";
export { MAXIMUM_PERFORMANCE_DURATION_MS, TARGET_PERFORMANCE_COMMIT_COUNT, TARGET_PERFORMANCE_FILE_COUNT, TARGET_PERFORMANCE_FIXTURE, } from "./performance-constants.js";
export { createPerformanceFixture, fastImportStream, } from "./performance-fixture.js";
/** Warms once, measures three fresh calls, and rejects slow runs. */
export declare function benchmarkPerformanceFixture(fixture: PerformanceFixture, { runFreshJsonAnalysis, now, }: PerformanceBenchmarkDependencies): Promise<PerformanceBenchmarkResult>;
/** Encodes benchmark durations and the maximum as the CI artifact document. */
export declare function performanceBenchmarkJson(result: PerformanceBenchmarkResult): string;
