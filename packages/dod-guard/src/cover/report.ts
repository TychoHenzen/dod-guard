/**
 * The three-outcome coverage report. In 3a, reachability is stubbed: a bound
 * scenario always reports covered-but-not-integrated, since nothing has run
 * the test yet to tell integrated apart from merely covered. 3b replaces
 * `stubOutcome` with a real isolated-coverage run; nothing else in this file
 * changes shape when it lands.
 */
import type { EnumeratedScenario } from "./enumerate.js";
import { scanMarkers } from "./markers.js";

export type Outcome = "covered-and-integrated" | "covered-but-not-integrated" | "unwired" | "failed";

export interface ScenarioReport {
  scenarioId: string;
  group: string;
  capability: string;
  requirementTitle: string;
  scenarioTitle: string;
  outcome: Outcome;
  note: string;
}

function stubOutcome(testName: string, file: string): { outcome: Outcome; note: string } {
  return {
    outcome: "covered-but-not-integrated",
    note: `bound to "${testName}" in ${file}; reachability not checked yet (lands in a follow-up commit)`,
  };
}

/** Build the report for one enumeration's worth of scenarios. Scans each
 * group's markers once, not once per scenario. */
export async function buildReport(cwd: string, scenarios: EnumeratedScenario[]): Promise<ScenarioReport[]> {
  const markersByGroup = new Map<string, Awaited<ReturnType<typeof scanMarkers>>>();
  const reports: ScenarioReport[] = [];

  for (const scenario of scenarios) {
    let markers = markersByGroup.get(scenario.group);
    if (!markers) {
      markers = await scanMarkers(cwd, scenario.group);
      markersByGroup.set(scenario.group, markers);
    }

    const binding = markers.get(scenario.id);
    const { outcome, note } = binding
      ? stubOutcome(binding.testName, binding.file)
      : { outcome: "unwired" as const, note: "no test binds this scenario" };

    reports.push({
      scenarioId: scenario.id,
      group: scenario.group,
      capability: scenario.capability,
      requirementTitle: scenario.requirementTitle,
      scenarioTitle: scenario.scenarioTitle,
      outcome,
      note,
    });
  }

  return reports;
}

/** Outcome rank for the ratchet: higher is better. `failed` and `unwired`
 * rank equally - a failing bound test proves nothing more than no test at
 * all, so there's no clarity in a fourth rank. */
export function outcomeRank(outcome: Outcome): number {
  switch (outcome) {
    case "covered-and-integrated":
      return 2;
    case "covered-but-not-integrated":
      return 1;
    default:
      return 0;
  }
}

export function summarizeReport(reports: ScenarioReport[]): Record<Outcome, number> {
  const summary: Record<Outcome, number> = {
    "covered-and-integrated": 0,
    "covered-but-not-integrated": 0,
    unwired: 0,
    failed: 0,
  };
  for (const report of reports) summary[report.outcome]++;
  return summary;
}
