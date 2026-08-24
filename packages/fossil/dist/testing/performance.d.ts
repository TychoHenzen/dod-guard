export declare const TARGET_PERFORMANCE_COMMIT_COUNT = 5000;
export declare const TARGET_PERFORMANCE_FILE_COUNT = 1000;
export declare const MAXIMUM_PERFORMANCE_DURATION_MS = 10000;
export interface PerformanceFixtureSpec {
    readonly commitCount: number;
    readonly fileCount: number;
}
export interface PerformanceFixture {
    readonly root: string;
    readonly commitCount: number;
    readonly fileCount: number;
    cleanup(): Promise<void>;
}
export interface PerformanceBenchmarkResult {
    readonly durationsMs: readonly number[];
    readonly maximumDurationMs: number;
}
export interface PerformanceBenchmarkDependencies {
    readonly runFreshJsonAnalysis: (repositoryPath: string) => Promise<void>;
    readonly now?: () => number;
}
export declare const TARGET_PERFORMANCE_FIXTURE: PerformanceFixtureSpec;
/** Builds deterministic fast-import input with every source path created before later updates. */
export declare function fastImportStream({ commitCount, fileCount }: PerformanceFixtureSpec): string;
/** Creates the target-size repository through Git fast-import without host identity configuration. */
export declare function createPerformanceFixture(spec?: PerformanceFixtureSpec): Promise<PerformanceFixture>;
/** Warms once, measures three fresh JSON-analysis calls, and rejects any run at or above ten seconds. */
export declare function benchmarkPerformanceFixture(fixture: PerformanceFixture, { runFreshJsonAnalysis, now }: PerformanceBenchmarkDependencies): Promise<PerformanceBenchmarkResult>;
/** Encodes benchmark durations and the maximum as the CI artifact document. */
export declare function performanceBenchmarkJson(result: PerformanceBenchmarkResult): string;
