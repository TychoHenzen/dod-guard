// The internal verdict shape produced by computeVerdict() in checker.ts,
// before it is spread into the public CheckResult.
import type { CheckOverall } from "./types.js";

export interface Verdict {
  overall: CheckOverall;
  tampered: boolean;
  computedFingerprint: string;
  draftCount: number;
}
