import { execFileSync } from "node:child_process";
import type { Snapshot } from "./snapshot.js";
export { scannerEvidence } from "./cli-tree-scanner.js";

const SOURCE_PATTERN = new RegExp(
  String.raw`\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|` +
    String.raw`cc|cpp|` +
    String.raw`cxx|h|hpp)$`,
  "i",
);

export function treeFile(input: {
  root: string;
  ref: string;
  filePath: string;
  fallback?: string;
}): string {
  try {
    return execFileSync(
      "git",
      [
        "show",
        input.ref === "index"
          ? `:${input.filePath}`
          : `${input.ref}:${input.filePath}`,
      ],
      {
        cwd: input.root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    if (input.fallback !== undefined) return input.fallback;
    throw new Error(
      `${input.filePath} is not present in ` +
        (input.ref === "index" ? "the staged index" : `tree ${input.ref}`),
    );
  }
}

export function snapshotConfig(root: string, ref: string): string {
  return treeFile({
    root,
    ref,
    filePath: ".quality-guard.json",
    fallback: "{}",
  });
}

function isSourceOrConfiguration(filePath: string): boolean {
  return SOURCE_PATTERN.test(filePath) || filePath === ".quality-guard.json";
}

function isDistributionPath(filePath: string): boolean {
  return /(?:^|[/\\])dist(?:[/\\]|$)/.test(filePath);
}

export function withoutDistributionChanges(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    changes: snapshot.changes.filter((change) =>
      [change.before?.path, change.after?.path]
        .filter((filePath): filePath is string => Boolean(filePath))
        .some((filePath) => !isDistributionPath(filePath)),
    ),
  };
}

export function sourceChange(filePath: string): boolean {
  return isSourceOrConfiguration(filePath);
}
