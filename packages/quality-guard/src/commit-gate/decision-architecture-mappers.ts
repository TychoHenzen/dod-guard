import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import type { analyzeSimilarity } from "./architecture-similarity.js";
import { analyzeDependencies } from "./dependency.js";
import { reviewPathFindings } from "./design-smells/review-path-findings.js";
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

export function similarityFindings(
  findings: ReturnType<typeof analyzeSimilarity>,
): DecisionResult["findings"] {
  return findings.map((finding) =>
    architectureFinding({
      kind: finding.kind,
      severity: "review",
      affectedPaths: [
        finding.directory,
        ...finding.outliers.map((outlier) => outlier.path),
      ],
      evidence: { ...finding },
      reason: "directory ownership signals are split",
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
  return reviewPathFindings(
    findings,
    () => "public or compatibility surface changed",
  );
}

export function designFindings(
  findings: Array<{ kind: string; path: string }>,
): DecisionResult["findings"] {
  return reviewPathFindings(findings, (finding) =>
    finding.kind === "configurable-data"
      ? "a configuration default is owned by a configured low-level module"
      : "a simple receiver chain crosses multiple collaborators",
  );
}
