export const METRIC_KEYS = [
  "sourceCount",
  "testCount",
  "skippedTestCount",
  "behaviorCount",
  "testedBehaviorCount",
  "boundaryCount",
  "testedBoundaryCount",
  "bugCount",
  "testedBugCount",
  "coverageSourceCount",
  "failureCount",
] as const;

export function emptyMetrics() {
  return {
    languages: [],
    totals: Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])),
    coverage: { observedSourceCount: 0, gaps: [], uncovered: {} },
    timing: {
      measuredTestCount: 0,
      overBudgetTestCount: 0,
      unbudgetedTestIds: [],
    },
  };
}
