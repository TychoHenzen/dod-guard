import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FossilAnalysisError } from "./analysis-error.js";
import { analysisOptions, createRunGit, gitOutput, } from "./repository-analysis.helpers.test.js";
import { historyOutputForHead } from "./repository-analysis-history-head.js";
import { sparseCheckoutOutput } from "./repository-analysis-history-steps.js";
import { analyzeRepositoryCore } from "./repository-analysis.js";
function failedHeadCommands() {
    const failure = {
        ...gitOutput(),
        exitCode: 1,
        stderr: "fatal: bad object HEAD\n",
        stderrBytes: Buffer.byteLength("fatal: bad object HEAD\n"),
    };
    return [
        { arguments: ["rev-parse", "--verify", "HEAD"], output: failure },
        {
            arguments: ["symbolic-ref", "--quiet", "HEAD"],
            output: gitOutput("refs/heads/main\n"),
        },
        {
            arguments: ["status", "--porcelain=v1", "--untracked-files=no"],
            output: failure,
        },
    ];
}
test("rejects failed HEAD verification without unborn evidence", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fossil-head-failure-"));
    const runGit = createRunGit(directory, failedHeadCommands());
    try {
        await assert.rejects(analyzeRepositoryCore(directory, analysisOptions, runGit), (error) => error instanceof FossilAnalysisError && error.code === "git_failure");
    }
    finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
test("maps an unreadable unborn-head command to a Git failure", async () => {
    await assert.rejects(historyOutputForHead(1, async () => {
        throw new Error("Git could not start");
    }, "C:/repo"), (error) => error instanceof FossilAnalysisError && error.code === "git_failure");
});
test("suppresses only a missing sparse-checkout key", async () => {
    const missing = await sparseCheckoutOutput(async () => ({ ...gitOutput(), exitCode: 1 }), "C:/repo");
    assert.equal(missing.exitCode, 0);
    await assert.rejects(sparseCheckoutOutput(async () => ({
        ...gitOutput(),
        exitCode: 1,
        stderr: "fatal: repository unavailable\n",
        stderrBytes: Buffer.byteLength("fatal: repository unavailable\n"),
    }), "C:/repo"), (error) => error instanceof FossilAnalysisError && error.code === "git_failure");
});
//# sourceMappingURL=repository-analysis-failure-limits.test.js.map