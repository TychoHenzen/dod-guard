import { execFileSync } from "node:child_process";
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

function objectContent(root: string, spec: string): string {
  return git(root, ["show", spec]) as string;
}

function changePath(change: Snapshot["changes"][number]): string {
  return change.after?.path ?? change.before?.path ?? "";
}

function changesFrom(
  root: string,
  values: string[],
  contentSpec: (filePath: string, after: boolean) => string,
): Snapshot["changes"] {
  const changes: Snapshot["changes"] = [];
  for (let index = 0; index < values.length; index += 1) {
    const result = changeAt({
      values,
      index,
      contentSpec,
      readContent: (spec) => objectContent(root, spec),
    });
    if (result.change) changes.push(result.change);
    index = result.next;
  }
  return changes.sort((left, right) =>
    changePath(left).localeCompare(changePath(right)),
  );
}

export function changeSnapshot(
  root: string,
  source: {
    base: string;
    target: string;
    contentSpec(path: string, after: boolean): string;
  },
): Snapshot {
  const output = git(
    root,
    ["diff", "--name-status", "-z", "-M", source.base, source.target],
    "buffer",
  ) as Buffer;
  const values = output.toString("utf8").split("\0").filter(Boolean);
  return {
    baseIdentity: (git(root, ["rev-parse", source.base]) as string).trim(),
    targetIdentity: (git(root, ["rev-parse", source.target]) as string).trim(),
    changes: changesFrom(root, values, source.contentSpec),
  };
}

export { git, objectContent };
