import { createFinding, type DecisionResult } from "../types.js";

export function reviewPathFindings<T extends { kind: string; path: string }>(
  findings: T[],
  reason: (finding: T) => string,
): DecisionResult["findings"] {
  return findings.map((finding) =>
    createFinding({
      severity: "review",
      affectedPaths: [finding.path],
      before: {},
      after: { ...finding },
      reason: `${finding.kind}: ${reason(finding)}`,
    }),
  );
}
