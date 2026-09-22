import { execFileSync } from "node:child_process";
import { sourceSnapshotIdentity } from "./fingerprint.js";
import { changeAt } from "./snapshot-change-entries.js";
import type { Snapshot } from "./snapshot-types.js";

const GIT_OUTPUT_MAX_BUFFER = 64 * 1024 * 1024;

function git(
  root: string,
  args: string[],
  encoding: "utf8" | "buffer" = "utf8",
): string | Buffer {
  return execFileSync("git", args, {
    cwd: root,
    encoding,
    maxBuffer: GIT_OUTPUT_MAX_BUFFER,
  });
}

function objectContent(
  root: string,
  spec: string,
  runGit: typeof git = git,
): string {
  return runGit(root, ["show", spec]) as string;
}

function changePath(change: Snapshot["changes"][number]): string {
  return change.after?.path ?? change.before?.path ?? "";
}

function changesFrom(
  values: string[],
  contentSpec: (filePath: string, after: boolean) => string,
  readContent: (spec: string) => string,
): Snapshot["changes"] {
  const changes: Snapshot["changes"] = [];
  for (let index = 0; index < values.length; index += 1) {
    const result = changeAt({
      values,
      index,
      contentSpec,
      readContent,
    });
    if (result.change) changes.push(result.change);
    index = result.next;
  }
  return changes.sort((left, right) =>
    changePath(left).localeCompare(changePath(right)),
  );
}

function verifiedTargetCommitSha(input: {
  root: string;
  source: { target: string; targetCommitSha?: string };
  runGit: typeof git;
}): string | undefined {
  const expectedSha = input.source.targetCommitSha;
  if (expectedSha === undefined) return undefined;
  const actualSha = (
    input.runGit(input.root, ["rev-parse", input.source.target]) as string
  ).trim();
  if (actualSha !== expectedSha)
    throw new Error("quality snapshot target does not resolve to its commit");
  return actualSha;
}

export function changeSnapshot(
  root: string,
  source: {
    base: string;
    target: string;
    targetCommitSha?: string;
    contentSpec(path: string, after: boolean): string;
  },
  runGit: typeof git = git,
): Snapshot {
  const output = runGit(
    root,
    ["diff", "--name-status", "-z", "-M", source.base, source.target],
    "buffer",
  ) as Buffer;
  const values = output.toString("utf8").split("\0").filter(Boolean);
  const changes = changesFrom(values, source.contentSpec, (spec) =>
    objectContent(root, spec, runGit),
  );
  const targetCommitSha = verifiedTargetCommitSha({ root, source, runGit });
  return {
    baseIdentity: (runGit(root, ["rev-parse", source.base]) as string).trim(),
    targetIdentity: targetCommitSha ?? sourceSnapshotIdentity(changes),
    targetCommitSha,
    changes,
  };
}

export { git, objectContent };
