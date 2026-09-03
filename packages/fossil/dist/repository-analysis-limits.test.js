import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FossilAnalysisError } from "./analysis-error.js";
import { nonMergeGitLogArguments } from "./git-history-core.js";
import { analysisOptions, createRunGit, gitOutput } from "./repository-analysis.helpers.test.js";
import { analyzeRepositoryCore } from "./repository-analysis.js";
test("rejects over-limit included history before producing a report", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fossil-history-limit-"));
    const record = `\u001ehash\0${Math.floor(Date.now() / 1_000)}\0A\0file.ts\0`;
    const history = record.repeat(100_001);
    const runGit = createRunGit(directory, [
        { arguments: ["rev-parse", "--verify", "HEAD"], output: gitOutput("hash\n") },
        { arguments: nonMergeGitLogArguments(), output: gitOutput(history) },
    ]);
    try {
        await assert.rejects(analyzeRepositoryCore(directory, analysisOptions, runGit), (error) => error instanceof FossilAnalysisError && error.code === "resource_limit");
    }
    finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
test("rejects an over-limit Git inventory before source reads", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fossil-inventory-limit-"));
    const tracked = `${Array.from({ length: 100_001 }, (_, index) => `src/file-${index}.ts`).join("\0")}\0`;
    const runGit = createRunGit(directory, [
        { arguments: ["rev-parse", "--verify", "HEAD"], output: { ...gitOutput(), exitCode: 1 } },
        { arguments: ["ls-files", "-z"], output: gitOutput(tracked) },
    ]);
    try {
        await assert.rejects(analyzeRepositoryCore(directory, analysisOptions, runGit), (error) => error instanceof FossilAnalysisError &&
            error.code === "resource_limit" &&
            error.message === "File inventory limit exceeded.");
    }
    finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
//# sourceMappingURL=repository-analysis-limits.test.js.map