import assert from "node:assert/strict";
import { test } from "node:test";
import { collectBoundedGitOutput } from "./git-process.js";
import { assertResourceLimit, pipedChild } from "./git-process.test-support.js";
async function assertExactHistoryOutput(firstChunk, secondChunk) {
    const historyOutput = `${firstChunk}${secondChunk}`;
    const exact = pipedChild();
    const exactResult = collectBoundedGitOutput(exact.child, {
        historyMode: true,
        limits: { maximumStatusRecords: 2 },
    });
    exact.emitStdout(firstChunk);
    exact.emitStdout(secondChunk);
    exact.close(0);
    assert.deepEqual(await exactResult, {
        exitCode: 0,
        stdout: historyOutput,
        stderr: "",
        stdoutBytes: Buffer.byteLength(historyOutput),
        stderrBytes: 0,
        statusRecordCount: 2,
    });
    assert.equal(exact.killCalls, 0);
}
async function assertHistoryStatusLimit(firstChunk, secondChunk) {
    const exceeded = pipedChild();
    const exceededResult = collectBoundedGitOutput(exceeded.child, {
        historyMode: true,
        limits: { maximumStatusRecords: 1 },
    });
    exceeded.emitStdout(firstChunk);
    exceeded.emitStdout(secondChunk);
    await assertResourceLimit(exceededResult, "Git status record limit exceeded.");
    assert.equal(exceeded.killCalls, 1);
}
test("counts uncommon NUL-delimited history statuses across chunks and " +
    "terminates at the next record", async () => {
    const firstChunk = `\u001ehash\0${1_700_000_000}\0B`;
    const secondChunk = "\0first.ts\0M\0second.ts\0";
    await assertExactHistoryOutput(firstChunk, secondChunk);
    await assertHistoryStatusLimit(firstChunk, secondChunk);
});
//# sourceMappingURL=git-process-history-output.cases.js.map