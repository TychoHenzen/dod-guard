export interface ChangePointCandidate {
  readonly cut: number;
  readonly gapMilliseconds: number;
  readonly similarity: number;
}
