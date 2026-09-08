import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRepository, FossilAnalysisError, runFossilCli } from "./index.js";
import { invalidDirectOptionShapes, optionsFor, reportFor, validDirectOptions } from "./index.test-support.js";
test("returns and serializes the same finalized report through one analysis core", async () => {
    const options = optionsFor("json");
    const calls = [];
    const core = async (repositoryPath, coreOptions) => {
        calls.push({ repositoryPath, options: coreOptions });
        return reportFor(coreOptions);
    };
    const apiReport = await analyzeRepository("C:/repositories/parity", options, core);
    const stdout = [];
    await runFossilCli(["node", "fossil", "analyze", "C:/repositories/parity", "--format", "json"], {
        analyze: core,
        stdout: (message) => stdout.push(message),
    });
    assert.deepEqual(JSON.parse(stdout.join("")), apiReport);
    assert.deepEqual(calls, [
        { repositoryPath: "C:/repositories/parity", options },
        { repositoryPath: "C:/repositories/parity", options },
    ]);
});
test("rejects malformed direct API option shapes before calling the analysis core", async () => {
    for (const invalid of invalidDirectOptionShapes) {
        let coreCalls = 0;
        await assert.rejects(analyzeRepository("C:/repositories/invalid", { ...validDirectOptions, ...invalid }, async (_repositoryPath, coreOptions) => {
            coreCalls += 1;
            return reportFor(coreOptions);
        }), (error) => error instanceof FossilAnalysisError && error.code === "invalid_options");
        assert.equal(coreCalls, 0);
    }
});
test("reports zero findings after a completed empty analysis", async () => {
    const stdout = [];
    await runFossilCli(["node", "fossil", "analyze"], {
        analyze: async (_repositoryPath, options) => reportFor(options),
        stdout: (message) => stdout.push(message),
    });
    assert.equal(stdout.join(""), "0 findings\n");
});
//# sourceMappingURL=index-api.cases.js.map