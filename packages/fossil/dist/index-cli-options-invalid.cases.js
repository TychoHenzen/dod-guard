import assert from "node:assert/strict";
import { test } from "node:test";
import { FossilUsageError, runFossilCli } from "./index.js";
import { reportFor } from "./index.test-support.js";
let analyzeCalls = 0;
async function analyzeForTest(_repositoryPath, options) {
    analyzeCalls += 1;
    return reportFor(options);
}
const INVALID_ARGUMENTS = [
    ["--days", "0"],
    ["--untracked-age", "3651"],
    ["--gap-hours", "8761"],
    ["--threshold", "-0.1"],
    ["--threshold", "NaN"],
    ["--format", "yaml"],
    [
        "--extensions",
        Array.from({ length: 65 }, (_, index) => `extension-${index}`).join(","),
    ],
    ["--unknown"],
    ["first", "second"],
];
async function assertInvalidArguments(argumentsForCase) {
    const stderr = [];
    const callsBefore = analyzeCalls;
    await assert.rejects(runFossilCli(["node", "fossil", "analyze", ...argumentsForCase], {
        analyze: analyzeForTest,
        stderr: (message) => stderr.push(message),
    }), (error) => error instanceof FossilUsageError && error.exitCode === 2);
    assert.equal(analyzeCalls, callsBefore);
    assert.match(stderr.join(""), /(?:error:|Usage: fossil analyze)/);
    assert.match(stderr.join(""), /Usage: fossil analyze/);
}
test("rejects invalid argument forms with usage " + "diagnostics before analysis", async () => {
    for (const argumentsForCase of INVALID_ARGUMENTS)
        await assertInvalidArguments(argumentsForCase);
});
test("runs the injected analysis for valid arguments", async () => {
    const stdout = [];
    const callsBefore = analyzeCalls;
    await runFossilCli(["node", "fossil", "analyze", "--format", "json"], {
        analyze: analyzeForTest,
        stdout: stdout.push.bind(stdout),
    });
    assert.equal(analyzeCalls, callsBefore + 1);
    assert.match(stdout.join(""), /\"schemaVersion\":1/);
});
//# sourceMappingURL=index-cli-options-invalid.cases.js.map