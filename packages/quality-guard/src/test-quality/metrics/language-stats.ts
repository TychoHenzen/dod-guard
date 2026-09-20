import type { Evidence } from "../types.js";

function testedCount(
  items: { id: string }[],
  tested: (id: string) => boolean,
): number {
  return items.filter((item) => tested(item.id)).length;
}

export function behaviorStats(
  sources: Evidence["sources"],
  tested: (id: string) => boolean,
) {
  const behaviors = sources.flatMap((source) =>
    source.behaviors.filter((behavior) => behavior.kind === "behavior"),
  );
  const boundaries = sources.flatMap((source) =>
    source.behaviors.filter((behavior) => behavior.kind === "boundary"),
  );
  return {
    behaviorCount: behaviors.length,
    testedBehaviorCount: testedCount(behaviors, tested),
    boundaryCount: boundaries.length,
    testedBoundaryCount: testedCount(boundaries, tested),
  };
}

export function bugStats(
  evidence: Evidence,
  paths: Set<string>,
  tested: (id: string) => boolean,
) {
  const bugs = (evidence.bugs ?? []).filter((bug) => paths.has(bug.sourcePath));
  return {
    bugCount: bugs.length,
    testedBugCount: bugs.filter((bug) => bug.behaviorIds.every(tested)).length,
  };
}
