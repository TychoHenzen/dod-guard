export interface Snapshot {
  baseIdentity: string;
  targetIdentity: string;
  changes: Array<{
    kind: "add" | "delete" | "modify" | "rename";
    before?: { path: string; content: string };
    after?: { path: string; content: string };
  }>;
}
