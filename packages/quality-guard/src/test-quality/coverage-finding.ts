import { makeFinding, uncovered } from "./findings/finding.js";
import type { Evidence } from "./types.js";

function linkedBehaviorIds(
  observation: NonNullable<Evidence["coverage"]>["observations"][number],
) {
  return [...new Set(observation.uncoveredBehaviorIds ?? [])];
}

function linkedFailures(evidence: Evidence, behaviorIds: string[]) {
  return (evidence.failures ?? []).filter(
    (failure) =>
      failure.behaviorId !== undefined &&
      behaviorIds.includes(failure.behaviorId),
  );
}

export function coverageFinding(
  evidence: Evidence,
  observation: NonNullable<Evidence["coverage"]>["observations"][number],
) {
  const uncoveredBehaviorIds = linkedBehaviorIds(observation);
  const failures = linkedFailures(evidence, uncoveredBehaviorIds);
  const gaps = uncovered(observation);
  if (failures.length === 0 || gaps.length === 0) return [];
  return [
    makeFinding({
      heuristic: "T8",
      rule: "coverage-pattern",
      path: observation.sourcePath,
      message: "uncovered coverage regions overlap a recorded runtime failure",
      remediation:
        "Use the gap to inspect the failing behavior and add a focused test.",
      evidence: {
        sourcePath: observation.sourcePath,
        uncovered: gaps,
        uncoveredBehaviorIds,
        failureTestIds: [...new Set(failures.map((failure) => failure.testId))],
      },
    }),
  ];
}
