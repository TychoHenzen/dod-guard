/**
 * Turn a `tasks.md` item list into a `/step-by-step` plan. One item, one
 * step, source order kept and each depending on the one before it. A
 * `covers`-bound item whose scenario `dod-guard cover` reports as
 * covered-and-integrated or covered-but-not-integrated gets that scenario's
 * bound test as `verify_cmd`; every other item stays manual.
 */
import type { ScenarioReport } from "../cover/report.js";
import type { TaskItem } from "./tasks-parser.js";

export interface Step {
  id: string;
  title: string;
  description: string;
  files: string[];
  deps: string[];
  verify_surface: "code";
  verify_cmd: string;
  manual_required: boolean;
  status: "pending";
}

const BOUND_OUTCOMES = new Set(["covered-and-integrated", "covered-but-not-integrated"]);

function verifyCmdFor(
  item: TaskItem,
  reportsById: Map<string, ScenarioReport>,
): { verify_cmd: string; manual_required: boolean } {
  const report = item.coversId ? reportsById.get(item.coversId) : undefined;
  if (report && BOUND_OUTCOMES.has(report.outcome) && report.runCommand) {
    return { verify_cmd: report.runCommand, manual_required: false };
  }
  return { verify_cmd: "", manual_required: true };
}

/** Build the step array. `deps` names each step's immediately preceding
 * item's id - never a scenario id, and never anything from `coverReports`. */
export function buildSteps(items: TaskItem[], coverReports: ScenarioReport[]): Step[] {
  const reportsById = new Map(coverReports.map((r) => [r.scenarioId, r]));
  const steps: Step[] = [];

  for (const item of items) {
    const { verify_cmd, manual_required } = verifyCmdFor(item, reportsById);
    steps.push({
      id: item.id,
      title: item.text,
      description: item.text,
      files: [],
      deps: steps.length > 0 ? [steps[steps.length - 1].id] : [],
      verify_surface: "code",
      verify_cmd,
      manual_required,
      status: "pending",
    });
  }

  return steps;
}
