import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRepository, runFossilCliProcess } from "./index.js";
import { optionsFor, reportFor } from "./index.test-support.js";
test("retains sorted nonfatal warnings in successful API and CLI JSON reports", async () => {
    const options = optionsFor("json");
    const warnings = [
        { code: "workspace_unreadable", message: "workspace unreadable", path: "./zeta.txt" },
        { code: "reference_unreadable", message: "second reference unreadable", path: "src\\middle.ts" },
        { code: "empty_repository", message: "repository is empty" },
        { code: "reference_unreadable", message: "first reference unreadable", path: "./src/alpha.ts" },
    ];
    const report = { ...reportFor(options), warnings };
    const expectedWarnings = [warnings[2], warnings[3], warnings[1], warnings[0]];
    const stdout = [];
    const stderr = [];
    const apiReport = await analyzeRepository("C:/repositories/warnings", options, async () => report);
    const exitCode = await runFossilCliProcess(["node", "fossil", "analyze", "C:/repositories/warnings", "--format", "json"], {
        analyze: async () => report,
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
    });
    assert.equal(exitCode, 0);
    assert.equal(stderr.join(""), "");
    assert.deepEqual(apiReport.warnings, expectedWarnings);
    assert.deepEqual(JSON.parse(stdout.join("")).warnings, expectedWarnings);
    assert.deepEqual(report.warnings, warnings);
});
//# sourceMappingURL=index-report.cases.js.map