// The fixed-priority verdict decision. See checker-summary.ts for the
// summary line, and checker-result.ts for the Verdict shape this feeds.
import type { CheckOverall } from "./types.js";

export interface VerdictInput {
  tampered: boolean;
  scoped: boolean;
  draftCount: number;
  stuck: boolean;
  anyFail: boolean;
  dirty: boolean;
  allowDirtyPass: boolean;
}

export function computeOverall(v: VerdictInput): CheckOverall {
  if (v.tampered) return "fail";
  if (v.scoped) return "incomplete";
  if (v.draftCount > 0) return "incomplete";
  if (v.stuck) return "stuck";
  if (v.anyFail) return "fail";
  if (v.dirty && !v.allowDirtyPass) return "pass_dirty";
  return "pass";
}
