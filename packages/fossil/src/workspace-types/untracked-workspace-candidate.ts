export interface UntrackedWorkspaceCandidate {
  readonly path: string;
  readonly kind: "untracked";
  readonly modifiedTimestampMs: number;
}
