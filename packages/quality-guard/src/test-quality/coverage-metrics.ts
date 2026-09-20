import type { Evidence } from "./types.js";

function uncoveredMetrics(
  evidence: NonNullable<Evidence["coverage"]>["observations"],
) {
  const uncovered: Record<string, { covered: number; total: number }> = {};
  for (const observation of evidence)
    for (const name of [
      "statements",
      "branches",
      "functions",
      "lines",
    ] as const) {
      const value = observation[name];
      if (value && value.covered < value.total)
        uncovered[`${observation.sourcePath}:${name}`] = value;
    }
  return uncovered;
}

function coverageGaps(evidence: Evidence, observations: string[]): string[] {
  return evidence.sources
    .filter(
      (source) =>
        source.behaviors.length > 0 && !observations.includes(source.path),
    )
    .map((source) => source.path);
}

export function coverageMetrics(evidence: Evidence) {
  const observations = evidence.coverage?.observations ?? [];
  const observedPaths = observations.map(
    (observation) => observation.sourcePath,
  );
  return {
    ...(evidence.coverage?.provider
      ? { provider: evidence.coverage.provider }
      : {}),
    observedSourceCount: observations.length,
    gaps: coverageGaps(evidence, observedPaths),
    uncovered: uncoveredMetrics(observations),
  };
}
