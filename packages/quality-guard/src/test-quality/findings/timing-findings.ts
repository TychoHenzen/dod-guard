import { makeFinding } from "./finding.js";
import type { Evidence } from "../types.js";

function budgetMap(evidence: Evidence) {
  return new Map(
    (evidence.timing?.budgets ?? []).map((budget) => [
      budget.testClass,
      budget.maxDurationMs,
    ]),
  );
}

function slowFinding(test: Evidence["tests"][number], budget: number) {
  return makeFinding({
    heuristic: "T9",
    rule: "slow-test",
    path: test.path,
    message: `test ${test.id} took ${test.durationMs}ms above its ${budget}ms budget`,
    remediation:
      "Split or isolate expensive work, or change the budget with environment evidence.",
    evidence: {
      testId: test.id,
      durationMs: test.durationMs,
      budgetMs: budget,
    },
  });
}

export function slowTests(evidence: Evidence) {
  if (!evidence.timing) return [];
  const budgets = budgetMap(evidence);
  return evidence.tests.flatMap((test) => {
    if (test.durationMs === undefined) return [];
    const budget = budgets.get(test.testClass);
    if (budget === undefined || test.durationMs <= budget) return [];
    return [slowFinding(test, budget)];
  });
}
