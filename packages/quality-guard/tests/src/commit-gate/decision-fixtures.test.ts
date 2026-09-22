import { parseQualityConfig } from "../../../src/commit-gate/config.js";
import type { Snapshot } from "../../../src/commit-gate/snapshot.js";
import { createFinding } from "../../../src/commit-gate/types.js";

export const snapshot: Snapshot = {
  baseIdentity: "base",
  targetIdentity: "index",
  targetCommitSha: "target-commit",
  changes: [
    {
      kind: "modify",
      before: { path: "src/a.ts", content: "before" },
      after: { path: "src/a.ts", content: "after" },
    },
  ],
};

export const growthScanner = {
  findings: [
    {
      severity: "review" as const,
      affectedPaths: ["src/a.ts"],
      before: {},
      after: {},
      reason: "growth",
    },
  ],
};

export function growthFinding() {
  return createFinding({
    severity: "review" as const,
    affectedPaths: ["src/a.ts"],
    before: {},
    after: {},
    reason: "growth",
  });
}

export function growthDecisionInput() {
  return {
    snapshot,
    config: parseQualityConfig("{}"),
    beforeFiles: [],
    afterFiles: [],
    scanner: growthScanner,
  };
}
