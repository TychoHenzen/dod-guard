import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { FossilAnalysisError } from "./analysis-error.js";
export function pipedChild() {
    const events = new EventEmitter();
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    let killCalls = 0;
    const child = {
        stdout: stdout,
        stderr: stderr,
        once: events.once.bind(events),
        kill: () => {
            killCalls += 1;
            return true;
        },
    };
    return {
        child,
        emitStdout: (text) => stdout.emit("data", Buffer.from(text)),
        emitStderr: (text) => stderr.emit("data", Buffer.from(text)),
        close: (code) => events.emit("close", code),
        get killCalls() {
            return killCalls;
        },
    };
}
export function repositoryDiscoveryArguments(repositoryPath) {
    return [
        "--no-pager",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "diff.external=",
        "-C",
        repositoryPath,
        "rev-parse",
        "--show-toplevel",
    ];
}
export async function assertResourceLimit(result, message) {
    await assert.rejects(result, (error) => error instanceof FossilAnalysisError &&
        error.code === "resource_limit" &&
        error.message === message);
}
//# sourceMappingURL=git-process.test-support.js.map