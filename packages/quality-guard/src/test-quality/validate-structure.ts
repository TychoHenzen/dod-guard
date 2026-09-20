import type { Evidence, Facts } from "./types.js";

function duplicateValues(values: string[], label: string): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (seen.has(value)) return [`duplicate ${label}: ${value}`];
    seen.add(value);
    return [];
  });
}

export function factsFor(evidence: Evidence): Facts {
  const facts: Facts = {
    sources: new Set(),
    behaviors: new Map(),
  };
  for (const source of evidence.sources) {
    facts.sources.add(source.path);
    for (const behavior of source.behaviors) {
      facts.behaviors.set(behavior.id, source.path);
    }
  }
  return facts;
}

export function sourceErrors(evidence: Evidence): string[] {
  const errors = duplicateValues(
    evidence.sources.map((source) => source.path),
    "source path",
  );
  const behaviorIds: string[] = [];
  for (const source of evidence.sources)
    behaviorIds.push(...source.behaviors.map((behavior) => behavior.id));
  return [...errors, ...duplicateValues(behaviorIds, "behavior id")];
}

export function testErrors(evidence: Evidence, facts: Facts): string[] {
  const duplicates = duplicateValues(
    evidence.tests.map((test) => test.id),
    "test id",
  );
  const unknown = evidence.tests.flatMap((test) =>
    test.covers
      .filter((behavior: string) => !facts.behaviors.has(behavior))
      .map(
        (behavior: string) =>
          `test ${test.id} covers unknown behavior ${behavior}`,
      ),
  );
  return [...duplicates, ...unknown];
}

export function coverageErrors(evidence: Evidence, facts: Facts): string[] {
  const observations = evidence.coverage?.observations ?? [];
  const unknown = observations
    .filter((observation) => !facts.sources.has(observation.sourcePath))
    .map(
      (observation) =>
        `coverage observes unknown source ${observation.sourcePath}`,
    );
  return [
    ...unknown,
    ...duplicateValues(
      observations.map((observation) => observation.sourcePath),
      "coverage observation",
    ),
  ];
}
