import { coverageFinding } from "../coverage-finding.js";
import type { Evidence } from "../types.js";
import { makeFinding, sourceForBehavior } from "./finding.js";
import { slowTests } from "./timing-findings.js";

function failureSource(
  evidence: Evidence,
  failure: NonNullable<Evidence["failures"]>[number],
) {
  if (failure.sourcePath) return failure.sourcePath;
  if (failure.behaviorId)
    return sourceForBehavior(evidence, failure.behaviorId) ?? ".";
  return ".";
}

function clusterFinding(
  key: string,
  failures: NonNullable<Evidence["failures"]>,
) {
  const testIds = [...new Set(failures.map((failure) => failure.testId))];
  if (testIds.length < 2) return [];
  const [path, signature, inputClass] = key.split("|");
  return [
    makeFinding({
      heuristic: "T7",
      rule: "failure-pattern",
      path: path ?? ".",
      message: `${testIds.length} failures share ${signature} for ${inputClass}`,
      remediation:
        "Inspect the shared input and affected path before fixing tests one by one.",
      evidence: { testIds, signature, inputClass },
    }),
  ];
}

function addFailure(
  clusters: Map<string, NonNullable<Evidence["failures"]>>,
  evidence: Evidence,
  failure: NonNullable<Evidence["failures"]>[number],
) {
  const key = `${failureSource(evidence, failure)}|${failure.signature}|${failure.inputClass}`;
  clusters.set(key, [...(clusters.get(key) ?? []), failure]);
}

function groupedFailures(evidence: Evidence) {
  const clusters = new Map<string, NonNullable<Evidence["failures"]>>();
  for (const failure of evidence.failures ?? [])
    addFailure(clusters, evidence, failure);
  return clusters;
}

function failureClusters(evidence: Evidence) {
  const clusters = groupedFailures(evidence);
  return [...clusters.entries()].flatMap(([key, failures]) =>
    clusterFinding(key, failures),
  );
}

function coveragePatterns(evidence: Evidence) {
  return (evidence.coverage?.observations ?? []).flatMap((observation) =>
    coverageFinding(evidence, observation),
  );
}

export function runtimeFindings(evidence: Evidence) {
  return [
    ...failureClusters(evidence),
    ...coveragePatterns(evidence),
    ...slowTests(evidence),
  ];
}
