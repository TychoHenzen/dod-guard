export interface Snapshot {
  baseIdentity: string;
  targetIdentity: string;
  /** Present only when the snapshot comes from an immutable committed tree. */
  targetCommitSha?: string;
  changes: Array<{
    kind: "add" | "delete" | "modify" | "rename";
    before?: { path: string; content: string };
    after?: { path: string; content: string };
  }>;
}

const SOURCE_PATH = new RegExp(
  String.raw`\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|` +
    String.raw`cc|cpp|` +
    String.raw`cxx|h|hpp)$`,
  "i",
);

export function isSourcePath(filePath: string): boolean {
  return SOURCE_PATH.test(filePath);
}
