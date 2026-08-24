import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RecordedCommit {
  readonly hash: string;
  readonly message: string;
  readonly timestamp: Date;
}

export interface TemporaryRepository {
  readonly root: string;
  git(args: readonly string[]): Promise<string>;
  writeSourceFile(relativePath: string, content: string): Promise<void>;
  removeSourcePath(relativePath: string): Promise<void>;
  recordCommit(message: string, timestamp: Date): Promise<RecordedCommit>;
  cleanup(): Promise<void>;
}

function toGitTimestamp(timestamp: Date): string {
  return timestamp.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Creates an isolated Git repository with an identity that never uses host configuration. */
export async function createTemporaryRepository(): Promise<TemporaryRepository> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fossil-fixture-"));

  async function git(args: readonly string[]): Promise<string> {
    const result = await execFileAsync("git", [...args], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    return result.stdout;
  }

  async function writeSourceFile(relativePath: string, content: string): Promise<void> {
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Fixture path must stay within the repository: ${relativePath}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }

  async function removeSourcePath(relativePath: string): Promise<void> {
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Fixture path must stay within the repository: ${relativePath}`);
    }
    await fs.rm(target, { recursive: true, force: true });
  }

  async function recordCommit(message: string, timestamp: Date): Promise<RecordedCommit> {
    const gitTimestamp = toGitTimestamp(timestamp);
    await git(["add", "--all"]);
    await execFileAsync("git", ["commit", "--quiet", "--message", message], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: gitTimestamp,
        GIT_COMMITTER_DATE: gitTimestamp,
      },
    });
    const hash = (await git(["rev-parse", "HEAD"])).trim();
    return { hash, message, timestamp: new Date(timestamp.getTime()) };
  }

  await git(["init", "--quiet"]);
  await git(["config", "user.name", "Fossil Fixture"]);
  await git(["config", "user.email", "fossil-fixture@example.invalid"]);

  return {
    root,
    git,
    writeSourceFile,
    removeSourcePath,
    recordCommit,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

/** Writes every path in a source tree relative to a temporary repository root. */
export async function writeSourceTree(
  repository: TemporaryRepository,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    await repository.writeSourceFile(relativePath, content);
  }
}

export interface OutputCapture {
  writeStdout(text: string): void;
  writeStderr(text: string): void;
  stdout(): string;
  stderr(): string;
}

/** Captures output through injected writers without replacing process streams. */
export function createOutputCapture(): OutputCapture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    writeStdout: (text) => stdout.push(text),
    writeStderr: (text) => stderr.push(text),
    stdout: () => stdout.join(""),
    stderr: () => stderr.join(""),
  };
}

export interface DeterministicClock {
  now(): Date;
  set(time: Date | number): void;
  advance(milliseconds: number): void;
}

/** Provides one mutable, copy-on-read clock for deterministic history and age tests. */
export function createDeterministicClock(initialTime: Date | number): DeterministicClock {
  let currentTime = new Date(initialTime).getTime();
  return {
    now: () => new Date(currentTime),
    set: (time) => {
      currentTime = new Date(time).getTime();
    },
    advance: (milliseconds) => {
      currentTime += milliseconds;
    },
  };
}
