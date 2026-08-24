import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
export const TARGET_PERFORMANCE_COMMIT_COUNT = 5_000;
export const TARGET_PERFORMANCE_FILE_COUNT = 1_000;
export const MAXIMUM_PERFORMANCE_DURATION_MS = 10_000;
export const TARGET_PERFORMANCE_FIXTURE = {
    commitCount: TARGET_PERFORMANCE_COMMIT_COUNT,
    fileCount: TARGET_PERFORMANCE_FILE_COUNT,
};
function sourcePath(index) {
    return `src/file-${index.toString().padStart(4, "0")}.ts`;
}
/** Builds deterministic fast-import input with every source path created before later updates. */
export function fastImportStream({ commitCount, fileCount }) {
    if (commitCount < fileCount || fileCount < 1)
        throw new RangeError("Performance fixture requires at least one commit per file.");
    const records = [];
    for (let index = 0; index < commitCount; index += 1) {
        const message = `commit ${index}`;
        const content = `export const revision = ${index};\n`;
        records.push(`commit refs/heads/main\n` +
            `author Fossil Fixture <fossil-fixture@example.invalid> ${1_735_689_600 + index} +0000\n` +
            `committer Fossil Fixture <fossil-fixture@example.invalid> ${1_735_689_600 + index} +0000\n` +
            `data ${Buffer.byteLength(message)}\n${message}\n` +
            `M 100644 inline ${sourcePath(index % fileCount)}\n` +
            `data ${Buffer.byteLength(content)}\n${content}`);
    }
    return `${records.join("")}done\n`;
}
function runFastImport(root, input) {
    return new Promise((resolve, reject) => {
        const child = spawn("git", ["fast-import", "--quiet"], {
            cwd: root,
            stdio: ["pipe", "ignore", "pipe"],
            windowsHide: true,
        });
        let stderr = "";
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.once("error", reject);
        child.once("close", (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`git fast-import failed with exit code ${code ?? "unknown"}: ${stderr}`));
        });
        child.stdin.end(input);
    });
}
function pointHeadAtImportedBranch(root) {
    return new Promise((resolve, reject) => {
        const child = spawn("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
            cwd: root,
            stdio: "ignore",
            windowsHide: true,
        });
        child.once("error", reject);
        child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`git symbolic-ref failed with exit code ${code ?? "unknown"}`)));
    });
}
/** Creates the target-size repository through Git fast-import without host identity configuration. */
export async function createPerformanceFixture(spec = TARGET_PERFORMANCE_FIXTURE) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fossil-performance-"));
    try {
        await new Promise((resolve, reject) => {
            const child = spawn("git", ["init", "--quiet"], { cwd: root, stdio: "ignore", windowsHide: true });
            child.once("error", reject);
            child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`git init failed with exit code ${code}`)));
        });
        await runFastImport(root, fastImportStream(spec));
        await pointHeadAtImportedBranch(root);
        return { root, ...spec, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
    }
    catch (error) {
        await fs.rm(root, { recursive: true, force: true });
        throw error;
    }
}
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