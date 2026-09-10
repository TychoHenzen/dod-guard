import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { analyzeDependencies } from "./dependency.js";
import { analyzeEncapsulation } from "./encapsulation.js";
import { analyzePlacement } from "./placement.js";
import { createFinding, type DecisionResult } from "./types.js";

function architectureFinding(input: {
  kind: string;
  severity: "review" | "fail";
  affectedPaths: string[];
  evidence: Record<string, unknown>;
  reason: string;
}): DecisionResult["findings"][number] {
  return createFinding({
    severity: input.severity,
    affectedPaths: input.affectedPaths,
    before: {},
    after: input.evidence,
    reason: `${input.kind}: ${input.reason}`,
  });
}

export function placementFindings(
  findings: ReturnType<typeof analyzePlacement>,
): DecisionResult["findings"] {
  return findings.map((finding) =>
    architectureFinding({
      kind: finding.kind,
      severity: "review",
      affectedPaths: [finding.directory],
      evidence: { ...finding },
      reason: "placement pressure increased",
    }),
  );
}

export function dependencyFindings(
  findings: ReturnType<typeof analyzeDependencies>,
): DecisionResult["findings"] {
  return findings.map((finding) =>
    architectureFinding({
      kind: finding.kind,
      severity: "fail",
      affectedPaths:
        finding.kind === "cycle" ? finding.cycle : [finding.from, finding.to],
      evidence: finding,
      reason: "a deterministic dependency boundary was introduced",
    }),
  );
}

export function encapsulationFindings(
  findings: ReturnType<typeof analyzeEncapsulation>,
): DecisionResult["findings"] {
  return findings.map((finding) =>
    architectureFinding({
      kind: finding.kind,
      severity: "review",
      affectedPaths: [finding.path],
      evidence: finding,
      reason: "public or compatibility surface changed",
    }),
  );
}
