import type { Evidence, Facts } from "../types.js";

function bugReferenceErrors(
  bug: NonNullable<Evidence["bugs"]>[number],
  facts: Facts,
): string[] {
  const errors = facts.sources.has(bug.sourcePath)
    ? []
    : [`bug ${bug.id} references unknown source ${bug.sourcePath}`];
  const behaviorErrors = bug.behaviorIds.flatMap((behavior) => {
    const sourcePath = facts.behaviors.get(behavior);
    if (sourcePath === undefined)
      return [`bug ${bug.id} references unknown behavior ${behavior}`];
    if (sourcePath !== bug.sourcePath)
      return [
        `bug ${bug.id} behavior ${behavior} is outside ${bug.sourcePath}`,
      ];
    return [];
  });
  return [...errors, ...behaviorErrors];
}

export function bugErrors(evidence: Evidence, facts: Facts): string[] {
  const bugs = evidence.bugs ?? [];
  const seen = new Set<string>();
  const duplicates = bugs.flatMap((bug) => {
    if (seen.has(bug.id)) return [`duplicate bug id: ${bug.id}`];
    seen.add(bug.id);
    return [];
  });
  return [
    ...duplicates,
    ...bugs.flatMap((bug) => bugReferenceErrors(bug, facts)),
  ];
}

function failureTestErrors(
  failure: NonNullable<Evidence["failures"]>[number],
  statuses: ReadonlyMap<string, string>,
): string[] {
  const status = statuses.get(failure.testId);
  if (!status) return [`failure references unknown test ${failure.testId}`];
  if (status === "failed") return [];
  return [`failure ${failure.testId} must reference a failed test`];
}

function failureSourceErrors(
  failure: NonNullable<Evidence["failures"]>[number],
  facts: Facts,
): string[] {
  if (!failure.sourcePath || facts.sources.has(failure.sourcePath)) return [];
  return [`failure references unknown source ${failure.sourcePath}`];
}

function failureBehaviorErrors(
  failure: NonNullable<Evidence["failures"]>[number],
  facts: Facts,
): string[] {
  if (!failure.behaviorId) return [];
  const sourcePath = facts.behaviors.get(failure.behaviorId);
  if (sourcePath === undefined)
    return [`failure references unknown behavior ${failure.behaviorId}`];
  if (!failure.sourcePath || sourcePath === failure.sourcePath) return [];
  return [
    `failure behavior ${failure.behaviorId} is outside ${failure.sourcePath}`,
  ];
}

function failureReferenceErrors(
  failure: NonNullable<Evidence["failures"]>[number],
  statuses: ReadonlyMap<string, string>,
  facts: Facts,
): string[] {
  return [
    ...failureTestErrors(failure, statuses),
    ...failureSourceErrors(failure, facts),
    ...failureBehaviorErrors(failure, facts),
  ];
}

export function failureErrors(evidence: Evidence, facts: Facts): string[] {
  const statuses = new Map(
    evidence.tests.map((test) => [test.id, test.status]),
  );
  return (evidence.failures ?? []).flatMap((failure) =>
    failureReferenceErrors(failure, statuses, facts),
  );
}

export function timingErrors(evidence: Evidence): string[] {
  const classes = (evidence.timing?.budgets ?? []).map(
    (budget) => budget.testClass,
  );
  return new Set(classes).size === classes.length
    ? []
    : ["timing.budgets must contain one budget per testClass"];
}
