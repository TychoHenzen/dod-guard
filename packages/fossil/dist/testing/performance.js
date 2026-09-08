import { MAXIMUM_PERFORMANCE_DURATION_MS } from "./performance-constants.js";
export { MAXIMUM_PERFORMANCE_DURATION_MS, TARGET_PERFORMANCE_COMMIT_COUNT, TARGET_PERFORMANCE_FILE_COUNT, TARGET_PERFORMANCE_FIXTURE, } from "./performance-constants.js";
export { createPerformanceFixture, fastImportStream } from "./performance-fixture.js";
/** Warms once, measures three fresh JSON-analysis calls, and rejects any run at or above ten seconds. */
export async function benchmarkPerformanceFixture(fixture, { runFreshJsonAnalysis, now = performance.now.bind(performance) }) {
    await runFreshJsonAnalysis(fixture.root);
    const durationsMs = [];
    for (let index = 0; index < 3; index += 1) {
        const start = now();
        await runFreshJsonAnalysis(fixture.root);
        const durationMs = now() - start;
        if (durationMs >= MAXIMUM_PERFORMANCE_DURATION_MS)
            throw new Error(`JSON analysis exceeded ${MAXIMUM_PERFORMANCE_DURATION_MS} ms: ${durationMs} ms`);
        durationsMs.push(durationMs);
    }
    return { durationsMs, maximumDurationMs: Math.max(...durationsMs) };
}
/** Encodes benchmark durations and the maximum as the CI artifact document. */
export function performanceBenchmarkJson(result) {
    return JSON.stringify(result);
}
//# sourceMappingURL=performance.js.map