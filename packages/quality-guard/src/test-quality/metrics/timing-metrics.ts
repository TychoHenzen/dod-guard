import type { Evidence } from "../types.js";

function budgetMap(evidence: Evidence) {
  return new Map(
    (evidence.timing?.budgets ?? []).map((budget) => [
      budget.testClass,
      budget.maxDurationMs,
    ]),
  );
}

function overBudgetCount(
  tests: Evidence["tests"],
  budgets: Map<string, number>,
): number {
  return tests.filter((test) => {
    const budget = budgets.get(test.testClass);
    return (
      test.durationMs !== undefined &&
      budget !== undefined &&
      test.durationMs > budget
    );
  }).length;
}

export function timingMetrics(evidence: Evidence) {
  const budgets = budgetMap(evidence);
  const measured = evidence.tests.filter(
    (test) => test.durationMs !== undefined,
  );
  return {
    ...(evidence.timing?.environment
      ? { environment: evidence.timing.environment }
      : {}),
    measuredTestCount: measured.length,
    overBudgetTestCount: overBudgetCount(measured, budgets),
    unbudgetedTestIds: measured
      .filter((test) => evidence.timing && !budgets.has(test.testClass))
      .map((test) => test.id),
  };
}
