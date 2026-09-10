import { changeSnapshot, git, objectContent } from "./snapshot-change.js";

export type { Snapshot } from "./snapshot-types.js";

import type { Snapshot } from "./snapshot-types.js";

const SOURCE_PATH = new RegExp(
  String.raw`\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|` +
    String.raw`cc|cpp|` +
    String.raw`cxx|h|hpp)$`,
  "i",
);
const DISTRIBUTION_PATH = /(?:^|[/\\])dist(?:[/\\]|$)/;

export function readStagedSnapshot(root: string): Snapshot {
  return changeSnapshot(root, {
    base: "HEAD",
    target: "--cached",
    contentSpec: (filePath, after) =>
      after ? `:${filePath}` : `HEAD:${filePath}`,
  });
}

export function readCommittedSnapshot(root: string, commit = "HEAD"): Snapshot {
  const parent = (git(root, ["rev-parse", `${commit}^`]) as string).trim();
  return changeSnapshot(root, {
    base: parent,
    target: commit,
    contentSpec: (filePath, after) => `${after ? commit : parent}:${filePath}`,
  });
}

function sourcePaths(root: string, ref: string | "index"): string[] {
  const args =
    ref === "index"
      ? ["ls-files", "-z"]
      : ["ls-tree", "-r", "-z", "--name-only", ref];
  return (git(root, args, "buffer") as Buffer)
    .toString("utf8")
    .split("\0")
    .filter(
      (filePath) =>
        SOURCE_PATH.test(filePath) && !DISTRIBUTION_PATH.test(filePath),
    )
    .sort((left, right) => left.localeCompare(right));
}

export function readSourceInventory(root: string, ref: string | "index") {
  return sourcePaths(root, ref).map((filePath) => ({
    path: filePath,
    content: objectContent(
      root,
      ref === "index" ? `:${filePath}` : `${ref}:${filePath}`,
    ),
  }));
}
