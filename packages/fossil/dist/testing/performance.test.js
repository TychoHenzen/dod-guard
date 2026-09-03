import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";
import { benchmarkPerformanceFixture, createPerformanceFixture, fastImportStream, MAXIMUM_PERFORMANCE_DURATION_MS, performanceBenchmarkJson, TARGET_PERFORMANCE_FIXTURE, } from "./performance.js";
const execFileAsync = promisify(execFile);
test("defines the target fixture and enforces three fresh JSON analysis runs below ten seconds", async () => {
    const input = fastImportStream(TARGET_PERFORMANCE_FIXTURE);
    const commitRecords = input.match(/^commit refs\/heads\/main$/gm) ?? [];
    const sourcePaths = new Set([...input.matchAll(/^M 100644 inline (src\/[^\n]+)$/gm)].map((match) => match[1]));
    const timestamps = [0, 9_999, 10_000, 19_999, 20_000, 29_999];
    const calls = [];
    const result = await benchmarkPerformanceFixture({ root: "C:/fixture", ...TARGET_PERFORMANCE_FIXTURE, cleanup: async () => undefined }, {
        runFreshJsonAnalysis: async (repositoryPath) => {
            calls.push(repositoryPath);
        },
        now: () => timestamps.shift() ?? 0,
    });
    assert.equal(commitRecords.length, 5_000);
    assert.equal(sourcePaths.size, 1_000);
    assert.deepEqual(calls, ["C:/fixture", "C:/fixture", "C:/fixture", "C:/fixture"]);
    assert.deepEqual(result, { durationsMs: [9_999, 9_999, 9_999], maximumDurationMs: 9_999 });
    assert.deepEqual(JSON.parse(performanceBenchmarkJson(result)), result);
    await assert.rejects(benchmarkPerformanceFixture({ root: "C:/fixture", ...TARGET_PERFORMANCE_FIXTURE, cleanup: async () => undefined }, {
        runFreshJsonAnalysis: async () => undefined,
        now: (() => {
            const exceedingTimestamps = [0, MAXIMUM_PERFORMANCE_DURATION_MS];
            return () => exceedingTimestamps.shift() ?? 0;
        })(),
    }), /exceeded 10000 ms/);
});
test("points HEAD at the fast-import branch for small real fixtures", async () => {
    const fixture = await createPerformanceFixture({ commitCount: 10, fileCount: 3 });
    try {
        const commits = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: fixture.root });
        const files = await execFileAsync("git", ["ls-tree", "-r", "-z", "--name-only", "HEAD"], { cwd: fixture.root });
        assert.equal(commits.stdout.trim(), "10");
        assert.equal(files.stdout.split("\0").filter(Boolean).length, 3);
    }
    finally {
        await fixture.cleanup();
    }
});
//# sourceMappingURL=performance.test.js.map