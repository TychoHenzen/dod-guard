import type { Evidence } from "./types.js";

export function makeFinding(input: {
  heuristic: string;
  rule: string;
  path: string;
  message: string;
  remediation: string;
  evidence: Record<string, unknown>;
}) {
  return { ...input, severity: "review" as const, line: 1 as const };
}

export function activeTests(evidence: Evidence, behaviorId: string) {
  return evidence.tests.filter(
    (test) => test.status !== "skipped" && test.covers.includes(behaviorId),
  );
}

export function sourceForBehavior(evidence: Evidence, behaviorId: string) {
  return evidence.sources.find((source) =>
    source.behaviors.some((behavior) => behavior.id === behaviorId),
  )?.path;
}

export function uncovered(
  observation: NonNullable<Evidence["coverage"]>["observations"][number],
) {
  return (["statements", "branches", "functions", "lines"] as const).flatMap(
    (name) => {
      const current = observation[name];
      return current && current.covered < current.total
        ? [`${name}:${current.covered}/${current.total}`]
        : [];
    },
  );
}
