import { execFileSync } from "node:child_process";

export type SnapshotChangeKind = "add" | "delete" | "modify" | "rename";

export interface SnapshotFile {
  path: string;
  content: string;
}

export interface SnapshotChange {
  kind: SnapshotChangeKind;
  before?: SnapshotFile;
  after?: SnapshotFile;
}

export interface Snapshot {
  baseIdentity: string;
  targetIdentity: string;
  changes: SnapshotChange[];
}

const SOURCE_PATH = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|cc|cpp|cxx|h|hpp)$/i;

interface GitSource {
  base: string;
  target: string;
  contentSpec(path: string, after: boolean): string;
}

function git(root: string, args: string[], encoding: "utf8" | "buffer" = "utf8"): string | Buffer {
  return execFileSync("git", args, { cwd: root, encoding });
}

function objectContent(root: string, spec: string): string {
  return git(root, ["show", spec]) as string;
}

function changeSnapshot(root: string, source: GitSource): Snapshot {
  const output = git(root, ["diff", "--name-status", "-z", "-M", source.base, source.target], "buffer") as Buffer;
  const values = output.toString("utf8").split("\0").filter(Boolean);
  const changes: SnapshotChange[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const status = values[index];
    if (!status) continue;
    const code = status[0];
    if (code === "R" || code === "C") {
      const beforePath = values[++index];
      const afterPath = values[++index];
      changes.push({
        kind: "rename",
        before: { path: beforePath, content: objectContent(root, source.contentSpec(beforePath, false)) },
        after: { path: afterPath, content: objectContent(root, source.contentSpec(afterPath, true)) },
      });
      continue;
    }
    const filePath = values[++index];
    if (code === "A") {
      changes.push({
        kind: "add",
        after: { path: filePath, content: objectContent(root, source.contentSpec(filePath, true)) },
      });
    } else if (code === "D") {
      changes.push({
        kind: "delete",
        before: { path: filePath, content: objectContent(root, source.contentSpec(filePath, false)) },
      });
    } else {
      changes.push({
        kind: "modify",
        before: { path: filePath, content: objectContent(root, source.contentSpec(filePath, false)) },
        after: { path: filePath, content: objectContent(root, source.contentSpec(filePath, true)) },
      });
    }
  }
  changes.sort((left, right) =>
    (left.after?.path ?? left.before?.path ?? "").localeCompare(right.after?.path ?? right.before?.path ?? ""),
  );
  return {
    baseIdentity: (git(root, ["rev-parse", source.base]) as string).trim(),
    targetIdentity: (git(root, ["rev-parse", source.target]) as string).trim(),
    changes,
  };
}

/** Reads the virtual Git index. It never reads or changes the working tree. */
export function readStagedSnapshot(root: string): Snapshot {
  return changeSnapshot(root, {
    base: "HEAD",
    target: "--cached",
    contentSpec: (filePath, after) => (after ? `:${filePath}` : `HEAD:${filePath}`),
  });
}

/** Rebuilds a CI decision input from a commit and that commit's first parent. */
export function readCommittedSnapshot(root: string, commit = "HEAD"): Snapshot {
  const parent = git(root, ["rev-parse", `${commit}^`]) as string;
  return changeSnapshot(root, {
    base: parent.trim(),
    target: commit,
    contentSpec: (filePath, after) => `${after ? commit : parent.trim()}:${filePath}`,
  });
}

export type TreeReference = string | "index";

function sourcePaths(root: string, ref: TreeReference): string[] {
  const args = ref === "index" ? ["ls-files", "-z"] : ["ls-tree", "-r", "-z", "--name-only", ref];
  return (git(root, args, "buffer") as Buffer)
    .toString("utf8")
    .split("\0")
    .filter((filePath) => SOURCE_PATH.test(filePath))
    .sort((left, right) => left.localeCompare(right));
}

/** Returns the complete supported-source inventory from Git objects, never the working tree. */
export function readSourceInventory(root: string, ref: TreeReference): SnapshotFile[] {
  return sourcePaths(root, ref).map((filePath) => ({
    path: filePath,
    content: objectContent(root, ref === "index" ? `:${filePath}` : `${ref}:${filePath}`),
  }));
}
