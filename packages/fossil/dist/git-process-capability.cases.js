import assert from "node:assert/strict";
import { test } from "node:test";
import { FossilAnalysisError } from "./analysis-error.js";
import { assertSupportedGitVersion, parseGitVersion, readHistoryWithSupportedGit, } from "./git-process.js";
test("parses and accepts supported Git capability evidence", () => {
    assert.deepEqual(parseGitVersion("git version 2.30.0.windows.1\n"), {
        major: 2,
        minor: 30,
    });
    assert.deepEqual(assertSupportedGitVersion("git version 3.0.0\n"), {
        major: 3,
        minor: 0,
    });
});
async function assertUnsupportedGitOutput(output) {
    let historyCalls = 0;
    await assert.rejects(readHistoryWithSupportedGit(async () => output, async () => {
        historyCalls += 1;
        return "history";
    }), (error) => error instanceof FossilAnalysisError &&
        error.code === "git_capability" &&
        error.message === "Git 2.30 or newer is required for history analysis.");
    assert.equal(historyCalls, 0);
}
test("rejects unsupported Git capability evidence before calling the history " +
    "reader", async () => {
    for (const output of [
        "git version 2.29.9\n",
        "Git version unavailable\n",
    ]) {
        await assertUnsupportedGitOutput(output);
    }
    assert.equal(await readHistoryWithSupportedGit(async () => "git version 2.30.0\n", async () => "history"), "history");
});
//# sourceMappingURL=git-process-capability.cases.js.map