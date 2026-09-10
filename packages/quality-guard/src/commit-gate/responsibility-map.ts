import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import type { QualityConfig } from "./config.js";
import { analyzeRefactorProgress } from "./refactor-progress.js";

export type { ResponsibilityMap } from "./responsibility-map-types.js";

import type { ResponsibilityMap } from "./responsibility-map-types.js";

export { parseResponsibilityMap } from "./responsibility-map-parse.js";

function owns(
  files: ArchitectureFileFact[],
  responsibility: string,
  owner: string,
): boolean {
  return files.some((file) =>
    file.types.some(
      (type) =>
        type.name === owner &&
        type.members.some(
          (member) =>
            member.kind === "method" && member.name === responsibility,
        ),
    ),
  );
}

function hasDependency(
  files: ArchitectureFileFact[],
  from: string,
  to: string,
): boolean {
  return files.some((file) =>
    file.types.some(
      (type) => type.name === from && type.dependencies.includes(to),
    ),
  );
}

function desiredOutcomes(
  map: ResponsibilityMap,
  before: ArchitectureFileFact[],
  after: ArchitectureFileFact[],
) {
  return [
    ...map.desired.ownership.map((outcome) => ({
      description: `${outcome.responsibility} is owned by ${outcome.owner}`,
      before: owns(before, outcome.responsibility, outcome.owner),
      after: owns(after, outcome.responsibility, outcome.owner),
    })),
    ...map.desired.boundaries.map((outcome) => {
      const availability = outcome.allowed ? "allowed" : "absent";
      return {
        description: `${outcome.from} -> ${outcome.to} is ${availability}`,
        before:
          hasDependency(before, outcome.from, outcome.to) === outcome.allowed,
        after:
          hasDependency(after, outcome.from, outcome.to) === outcome.allowed,
      };
    }),
  ];
}

export function evaluateResponsibilityMap(
  map: ResponsibilityMap,
  input: {
    before: ArchitectureFileFact[];
    after: ArchitectureFileFact[];
    config: QualityConfig;
  },
) {
  const progress = analyzeRefactorProgress({
    before: input.before,
    after: input.after,
    affectedPaths: map.targetScope,
    config: input.config,
  });
  const outcomes = desiredOutcomes(map, input.before, input.after);
  return {
    ...progress,
    outcomes,
    hasDeclaredOutcomeProgress: outcomes.some(
      (outcome) => !outcome.before && outcome.after,
    ),
  };
}
