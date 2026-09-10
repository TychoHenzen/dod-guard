import { createHash } from "node:crypto";
import { canonical } from "./canonical.js";
import type { RefactorProgress } from "./refactor-progress-types.js";

export interface DecisionResult {
  verdict: "PASS" | "REVIEW_REQUIRED" | "FAIL";
  fingerprint?: string;
  findings: Array<{
    id: string;
    severity: "review" | "fail";
    affectedPaths: string[];
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    reason: string;
  }>;
  errors: string[];
  input: {
    baseIdentity: string;
    targetIdentity: string;
    changedSourcePaths: string[];
    /** Present when the staged input requires no source-quality decision. */
    reason?: string;
  };
  staleAcknowledgements?: string[];
  refactorProgress?: RefactorProgress;
}

export function createFinding(
  input: Omit<DecisionResult["findings"][number], "id">,
) {
  const affectedPaths = [...new Set(input.affectedPaths)].sort((left, right) =>
    left.localeCompare(right),
  );
  const identity = canonical({ ...input, affectedPaths });
  return {
    ...input,
    affectedPaths,
    id: createHash("sha256").update(identity).digest("hex"),
  };
}

export function normalizeFindings(findings: DecisionResult["findings"]) {
  return findings
    .map(({ id: _id, ...finding }) => createFinding(finding))
    .sort((left, right) => left.id.localeCompare(right.id));
}
