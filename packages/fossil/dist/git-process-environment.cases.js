import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { discoverGitRepository } from "./git-process.js";
import { repositoryDiscoveryArguments } from "./git-process.test-support.js";
test("overrides hostile pager and prompt settings while preserving unrelated " +
    "environment values", () => {
    const calls = [];
    const environment = {
        PATH: "C:/Git/bin",
        FOSSIL_TEST_VALUE: "preserved",
        GIT_PAGER: "hostile-pager",
        GIT_TERMINAL_PROMPT: "1",
    };
    const runGit = (_command, arguments_, options) => {
        calls.push({ arguments_, options });
        return new EventEmitter();
    };
    discoverGitRepository("C:/repositories/example", runGit, environment);
    assert.deepEqual(calls, [
        {
            arguments_: repositoryDiscoveryArguments("C:/repositories/example"),
            options: {
                shell: false,
                windowsHide: true,
                env: {
                    PATH: "C:/Git/bin",
                    FOSSIL_TEST_VALUE: "preserved",
                    GIT_PAGER: "cat",
                    GIT_TERMINAL_PROMPT: "0",
                },
            },
        },
    ]);
    assert.deepEqual(environment, {
        PATH: "C:/Git/bin",
        FOSSIL_TEST_VALUE: "preserved",
        GIT_PAGER: "hostile-pager",
        GIT_TERMINAL_PROMPT: "1",
    });
});
test("adds config overrides that disable repository filesystem monitors and " +
    "external diff helpers", () => {
    const calls = [];
    const runGit = (_command, arguments_) => {
        calls.push({ arguments_ });
        return new EventEmitter();
    };
    discoverGitRepository("C:/repositories/hostile-config", runGit, {});
    assert.deepEqual(calls[0].arguments_.slice(0, 5), [
        "--no-pager",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "diff.external=",
    ]);
});
//# sourceMappingURL=git-process-environment.cases.js.map