import { parseQualityConfig } from "./config.js";
import type { Snapshot } from "./snapshot.js";
import { createFinding } from "./types.js";

export const snapshot: Snapshot = {
  baseIdentity: "base",
  targetIdentity: "index",
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
