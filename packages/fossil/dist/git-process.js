import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { FossilAnalysisError } from "./analysis-error.js";
export const DEFAULT_GIT_INGESTION_LIMITS = {
    maximumStdoutBytes: 256 * 1_024 * 1_024,
    maximumStderrBytes: 1_024 * 1_024,
    maximumStatusRecords: 1_000_000,
};
function spawnGit(command, arguments_, options) {
    return spawn(command, [...arguments_], options);
}
/** Git global options required for every noninteractive fossil subprocess. */
export const SAFE_GIT_BASE_ARGUMENTS = ["--no-pager", "-c", "core.fsmonitor=false", "-c", "diff.external="];
/** Keeps caller environment values while overriding Git's interactive process controls. */
export function safeGitEnvironment(environment = process.env) {
    return { ...environment, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" };
}
class GitHistoryStatusCounter {
    #buffer = "";
    #state = "header";
    #remainingPaths = 0;
    #count = 0;
    get count() {
        return this.#count;
    }
    add(chunk) {
        this.#buffer += chunk;
        for (let separator = this.#buffer.indexOf("\0"); separator !== -1; separator = this.#buffer.indexOf("\0")) {
            const token = this.#buffer.slice(0, separator);
            this.#buffer = this.#buffer.slice(separator + 1);
            this.#consume(token);
        }
        return this.#count;
    }
    #consume(token) {
        if (token.startsWith("\u001e")) {
            this.#state = "timestamp";
            this.#remainingPaths = 0;
            return;
        }
        if (this.#state === "timestamp") {
            this.#state = "status";
            return;
        }
        if (this.#state === "path") {
            this.#remainingPaths -= 1;
            if (this.#remainingPaths === 0)
                this.#state = "status";
            return;
        }
        if (this.#state !== "status")
            return;
        const status = token.replace(/^\r?\n/, "");
        if (!/^[A-Z]\d*$/.test(status))
            return;
        this.#count += 1;
        this.#remainingPaths = status[0] === "R" || status[0] === "C" ? 2 : 1;
        this.#state = "path";
    }
}
/** Collects piped Git output within bounded byte and history-status record limits. */
export function collectBoundedGitOutput(child, { historyMode = false, limits: suppliedLimits = {} } = {}) {
    const limits = { ...DEFAULT_GIT_INGESTION_LIMITS, ...suppliedLimits };
    const stdout = child.stdout;
    const stderr = child.stderr;
    if (!(stdout && stderr))
        return Promise.reject(new Error("Git child must use piped stdout and stderr."));
    return new Promise((resolvePromise, rejectPromise) => {
        const stdoutDecoder = new StringDecoder();
        const stderrDecoder = new StringDecoder();
        const statusCounter = new GitHistoryStatusCounter();
        const stdoutParts = [];
        const stderrParts = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let settled = false;
        const rejectLimit = (message) => {
            if (settled)
                return;
            settled = true;
            try {
                child.kill();
            }
            finally {
                rejectPromise(new FossilAnalysisError({ code: "resource_limit", message }));
            }
        };
        stdout.on("data", (chunk) => {
            if (settled)
                return;
            stdoutBytes += chunk.byteLength;
            if (stdoutBytes > limits.maximumStdoutBytes) {
                rejectLimit("Git stdout limit exceeded.");
                return;
            }
            const text = stdoutDecoder.write(chunk);
            stdoutParts.push(text);
            if (historyMode && statusCounter.add(text) > limits.maximumStatusRecords)
                rejectLimit("Git status record limit exceeded.");
        });
        stderr.on("data", (chunk) => {
            if (settled)
                return;
            stderrBytes += chunk.byteLength;
            if (stderrBytes > limits.maximumStderrBytes) {
                rejectLimit("Git stderr limit exceeded.");
                return;
            }
            stderrParts.push(stderrDecoder.write(chunk));
        });
        child.once("error", (error) => {
            if (settled)
                return;
            settled = true;
            rejectPromise(error);
        });
        child.once("close", (exitCode) => {
            if (settled)
                return;
            const finalStdout = stdoutDecoder.end();
            const finalStderr = stderrDecoder.end();
            stdoutParts.push(finalStdout);
            stderrParts.push(finalStderr);
            if (historyMode && statusCounter.add(finalStdout) > limits.maximumStatusRecords) {
                rejectLimit("Git status record limit exceeded.");
                return;
            }
            settled = true;
            resolvePromise({
                exitCode,
                stdout: stdoutParts.join(""),
                stderr: stderrParts.join(""),
                stdoutBytes,
                stderrBytes,
                statusRecordCount: statusCounter.count,
            });
        });
    });
}
/** Parses the standard Git version evidence needed for a capability decision. */
export function parseGitVersion(output) {
    const match = /^git version (\d+)\.(\d+)(?:\.\d+)?(?:[^\s]*)?\s*$/.exec(output);
    if (!(match?.[1] && match[2]))
        return undefined;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : undefined;
}
/** Rejects version evidence that cannot support fossil's history-analysis contract. */
export function assertSupportedGitVersion(output) {
    const version = parseGitVersion(output);
    if (!(version && (version.major > 2 || (version.major === 2 && version.minor >= 30))))
        throw new FossilAnalysisError({
            code: "git_capability",
            message: "Git 2.30 or newer is required for history analysis.",
        });
    return version;
}
/** Checks Git capability before calling the later history-reading boundary. */
export async function readHistoryWithSupportedGit(readVersion, readHistory) {
    assertSupportedGitVersion(await readVersion());
    return readHistory();
}
/** Starts repository discovery with the path held as one Git argument rather than shell source. */
export function discoverGitRepository(repositoryPath, runGit = spawnGit, environment = process.env) {
    return runGit("git", [...SAFE_GIT_BASE_ARGUMENTS, "-C", repositoryPath, "rev-parse", "--show-toplevel"], {
        shell: false,
        windowsHide: true,
        env: safeGitEnvironment(environment),
    });
}
/** Runs one noninteractive Git command and retains only bounded collected output. */
export async function runGitCommand(arguments_, repositoryPath, input, historyMode = false) {
    const scopedArguments = repositoryPath === undefined ? arguments_ : ["-C", repositoryPath, ...arguments_];
    const child = spawn("git", [...SAFE_GIT_BASE_ARGUMENTS, ...scopedArguments], {
        shell: false,
        windowsHide: true,
        env: safeGitEnvironment(),
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (input !== undefined)
        child.stdin?.end(input);
    return collectBoundedGitOutput(child, { historyMode });
}
//# sourceMappingURL=git-process.js.map