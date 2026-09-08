import assert from "node:assert/strict";
import { test } from "node:test";
import { FossilUsageError, runFossilCli } from "./index.js";
import { optionsFor, reportFor } from "./index.test-support.js";
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
    let analyzeCalls = 0;
    await assert.rejects(runFossilCli(["node", "fossil", "analyze", ...argumentsForCase], {
        analyze: async () => {
            analyzeCalls += 1;
            return reportFor(optionsFor());
        },
        stderr: (message) => stderr.push(message),
    }), (error) => error instanceof FossilUsageError && error.exitCode === 2);
    assert.equal(analyzeCalls, 0);
    assert.match(stderr.join(""), /(?:error:|Usage: fossil analyze)/);
    assert.match(stderr.join(""), /Usage: fossil analyze/);
}
test("rejects invalid argument forms with usage diagnostics before analysis", async () => {
    for (const argumentsForCase of INVALID_ARGUMENTS)
        await assertInvalidArguments(argumentsForCase);
});
//# sourceMappingURL=index-cli-options-invalid.cases.js.map