/**
 * The coverage report: bound (a marker names this scenario) or unwired (no
 * marker does). `cover` never runs a test - it scans markers by regex.
 */
import type { EnumeratedScenario } from "./enumerate.js";
import { scanMarkers } from "./markers.js";

export type Outcome = "bound" | "unwired";

export interface ScenarioReport {
  scenarioId: string;
  group: string;
  capability: string;
  requirementTitle: string;
  scenarioTitle: string;
  outcome: Outcome;
  note: string;
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
    reports.push({
      scenarioId: scenario.id,
      group: scenario.group,
      capability: scenario.capability,
      requirementTitle: scenario.requirementTitle,
      scenarioTitle: scenario.scenarioTitle,
      outcome: binding ? "bound" : "unwired",
      note: binding ? `bound to ${binding.testName} in ${binding.file}` : "no test binds this scenario",
    });
  }

  return reports;
}

/** Outcome rank for the ratchet: higher is better. Handles old baseline
 * values (covered-and-integrated, covered-but-not-integrated) as equivalent
 * to bound, so the transition does not produce false regressions. */
export function outcomeRank(outcome: string): number {
  switch (outcome) {
    case "bound":
    case "covered-and-integrated":
    case "covered-but-not-integrated":
      return 1;
    default:
      return 0;
  }
}

export function summarizeReport(reports: ScenarioReport[]): Record<Outcome, number> {
  const summary: Record<Outcome, number> = { bound: 0, unwired: 0 };
  for (const report of reports) summary[report.outcome]++;
  return summary;
}
