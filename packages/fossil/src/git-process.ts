import { type ChildProcess, spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { FossilAnalysisError } from "./analysis-error.js";

export interface GitSpawnOptions {
  readonly shell: false;
  readonly windowsHide: true;
  readonly env: NodeJS.ProcessEnv;
}

export type GitSpawn = (command: string, arguments_: readonly string[], options: GitSpawnOptions) => ChildProcess;

export interface GitVersion {
  readonly major: number;
  readonly minor: number;
}

export interface GitIngestionLimits {
  readonly maximumStdoutBytes: number;
  readonly maximumStderrBytes: number;
  readonly maximumStatusRecords: number;
}

export interface GitPipedChild {
  readonly stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  readonly stderr: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  once(event: "close", listener: (code: number | null) => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  kill(): boolean;
}

export interface CollectedGitOutput {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly statusRecordCount: number;
}

export interface GitOutputCollectionOptions {
  readonly historyMode?: boolean;
  readonly limits?: Partial<GitIngestionLimits>;
}

export const DEFAULT_GIT_INGESTION_LIMITS: GitIngestionLimits = {
  maximumStdoutBytes: 256 * 1_024 * 1_024,
  maximumStderrBytes: 1_024 * 1_024,
  maximumStatusRecords: 1_000_000,
};

function spawnGit(command: string, arguments_: readonly string[], options: GitSpawnOptions): ChildProcess {
  return spawn(command, [...arguments_], options);
}

/** Git global options required for every noninteractive fossil subprocess. */
export const SAFE_GIT_BASE_ARGUMENTS = ["--no-pager", "-c", "core.fsmonitor=false", "-c", "diff.external="] as const;

/** Keeps caller environment values while overriding Git's interactive process controls. */
export function safeGitEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...environment, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" };
}

class GitHistoryStatusCounter {
  #buffer = "";
  #state: "header" | "timestamp" | "status" | "path" = "header";
  #remainingPaths = 0;
  #count = 0;

  get count(): number {
    return this.#count;
  }

  add(chunk: string): number {
    this.#buffer += chunk;
    for (let separator = this.#buffer.indexOf("\0"); separator !== -1; separator = this.#buffer.indexOf("\0")) {
      const token = this.#buffer.slice(0, separator);
      this.#buffer = this.#buffer.slice(separator + 1);
      this.#consume(token);
    }
    return this.#count;
  }

  #consume(token: string): void {
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
      if (this.#remainingPaths === 0) this.#state = "status";
      return;
    }
    if (this.#state !== "status") return;
    const status = token.replace(/^\r?\n/, "");
    if (!/^[A-Z]\d*$/.test(status)) return;
    this.#count += 1;
    this.#remainingPaths = status[0] === "R" || status[0] === "C" ? 2 : 1;
    this.#state = "path";
  }
}

/** Collects piped Git output within bounded byte and history-status record limits. */
export function collectBoundedGitOutput(
  child: GitPipedChild,
  { historyMode = false, limits: suppliedLimits = {} }: GitOutputCollectionOptions = {},
): Promise<CollectedGitOutput> {
  const limits = { ...DEFAULT_GIT_INGESTION_LIMITS, ...suppliedLimits };
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!(stdout && stderr)) return Promise.reject(new Error("Git child must use piped stdout and stderr."));
  return new Promise((resolvePromise, rejectPromise) => {
    const stdoutDecoder = new StringDecoder();
    const stderrDecoder = new StringDecoder();
    const statusCounter = new GitHistoryStatusCounter();
    const stdoutParts: string[] = [];
    const stderrParts: string[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const rejectLimit = (message: string) => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } finally {
        rejectPromise(new FossilAnalysisError({ code: "resource_limit", message }));
      }
    };

    stdout.on("data", (chunk) => {
      if (settled) return;
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
      if (settled) return;
      stderrBytes += chunk.byteLength;
      if (stderrBytes > limits.maximumStderrBytes) {
        rejectLimit("Git stderr limit exceeded.");
        return;
      }
      stderrParts.push(stderrDecoder.write(chunk));
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    });
    child.once("close", (exitCode) => {
      if (settled) return;
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
export function parseGitVersion(output: string): GitVersion | undefined {
  const match = /^git version (\d+)\.(\d+)(?:\.\d+)?(?:[^\s]*)?\s*$/.exec(output);
  if (!(match?.[1] && match[2])) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : undefined;
}

/** Rejects version evidence that cannot support fossil's history-analysis contract. */
export function assertSupportedGitVersion(output: string): GitVersion {
  const version = parseGitVersion(output);
  if (!(version && (version.major > 2 || (version.major === 2 && version.minor >= 30))))
    throw new FossilAnalysisError({
      code: "git_capability",
      message: "Git 2.30 or newer is required for history analysis.",
    });
  return version;
}

/** Checks Git capability before calling the later history-reading boundary. */
export async function readHistoryWithSupportedGit<T>(
  readVersion: () => Promise<string>,
  readHistory: () => Promise<T>,
): Promise<T> {
  assertSupportedGitVersion(await readVersion());
  return readHistory();
}

/** Starts repository discovery with the path held as one Git argument rather than shell source. */
export function discoverGitRepository(
  repositoryPath: string,
  runGit: GitSpawn = spawnGit,
  environment: NodeJS.ProcessEnv = process.env,
): ChildProcess {
  return runGit("git", [...SAFE_GIT_BASE_ARGUMENTS, "-C", repositoryPath, "rev-parse", "--show-toplevel"], {
    shell: false,
    windowsHide: true,
    env: safeGitEnvironment(environment),
  });
}
