import assert from "node:assert/strict";
import { test } from "node:test";
import { runFossilCli } from "./index.js";
import { optionsFor, reportFor } from "./index.test-support.js";
test("passes normalized defaults and the current directory to analyze", async () => {
    const calls = [];
    let invocation = 0;
    const dependencies = {
        cwd: () => "C:/repositories/default",
        stdout: () => undefined,
        analyze: async (repositoryPath, options) => {
            calls.push({ repositoryPath, options: structuredClone(options) });
            if (invocation === 0) {
                options.extensions.push("mutated");
                options.exclude.push("mutated");
            }
            invocation += 1;
            return reportFor(options);
        },
    };
    await runFossilCli(["node", "fossil", "analyze"], dependencies);
    await runFossilCli(["node", "fossil", "analyze", "C:/repositories/explicit"], dependencies);
    assert.deepEqual(calls, [
        {
            repositoryPath: "C:/repositories/default",
            options: optionsFor(),
        },
        {
            repositoryPath: "C:/repositories/explicit",
            options: optionsFor(),
        },
    ]);
});
//# sourceMappingURL=index-cli-defaults.cases.js.map