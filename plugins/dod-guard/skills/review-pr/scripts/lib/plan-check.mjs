import { readJsonFile } from "../../../../lib/read-text.mjs";
import { requirePlan } from "./review-slots.mjs";
import { requireScannerQuestions } from "./scanner-plan.mjs";

// The planner does not know the status field, which the investigation step
// fills in later, so a missing one is filled before the plan shape is checked.
// A plan or entry of the wrong shape passes through for requirePlan to report.
function withStatus(plan) {
  if (!Array.isArray(plan)) {
    return plan;
  }
  return plan.map((entry) => {
    if (!Array.isArray(entry?.questions)) {
      return entry;
    }
    const questions = entry.questions.map((question) =>
      question && typeof question === "object" && question.status === undefined
        ? { ...question, status: "verified" }
        : question,
    );
    return { ...entry, questions };
  });
}

function countQuestions(plan) {
  return plan.reduce((sum, entry) => sum + (Array.isArray(entry.questions) ? entry.questions.length : 0), 0);
}

// Applies the same checks as the build to a fresh plan, so a planner mistake
// is named before any judge runs. It writes nothing.
function checkPlan(args) {
  const slots = readJsonFile(args.slots);
  const violations = readJsonFile(args.violations);
  const plan = withStatus(readJsonFile(args.plan));
  requirePlan(plan, slots);
  requireScannerQuestions(plan, violations);
  return {
    slots: slots.length,
    questions: countQuestions(plan),
    exclusions: plan.filter((entry) => entry.excluded !== undefined).length,
  };
}

export { checkPlan };
