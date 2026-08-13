/**
 * The three-outcome coverage report: unwired (no marker binds the scenario),
 * or a bound scenario's reachability - covered-and-integrated,
 * covered-but-not-integrated, or failed.
 */
import { type EntryPointsFile, entryPointsForGroup, loadEntryPoints } from "./entry-points.js";
import type { EnumeratedScenario } from "./enumerate.js";
import { scanMarkers } from "./markers.js";
import { checkReachability } from "./reachability.js";
import { buildTestRunCommand } from "./run-command.js";

export type Outcome = "covered-and-integrated" | "covered-but-not-integrated" | "unwired" | "failed";

export interface ScenarioReport {
  scenarioId: string;
  group: string;
  capability: string;
  requirementTitle: string;
  scenarioTitle: string;
  outcome: Outcome;
  note: string;
  /** The bound test's whole-file run command - absent when unwired. */
  runCommand: string | undefined;
}

interface BuildContext {
  cwd: string;
  markersByGroup: Map<string, Awaited<ReturnType<typeof scanMarkers>>>;
  entryPoints: EntryPointsFile;
}

type ResolvedOutcome = { outcome: Outcome; note: string; runCommand: string | undefined };

async function resolveOutcome(ctx: BuildContext, scenario: EnumeratedScenario): Promise<ResolvedOutcome> {
  let markers = ctx.markersByGroup.get(scenario.group);
  if (!markers) {
    markers = await scanMarkers(ctx.cwd, scenario.group);
    ctx.markersByGroup.set(scenario.group, markers);
  }
  const binding = markers.get(scenario.id);
  if (!binding) return { outcome: "unwired", note: "no test binds this scenario", runCommand: undefined };

  const runCommand = buildTestRunCommand(ctx.cwd, scenario.group, binding.file);
  const { outcome, note } = await checkReachability({
    cwd: ctx.cwd,
    group: scenario.group,
    testName: binding.testName,
    testFile: binding.file,
    entryPointFiles: entryPointsForGroup(ctx.entryPoints, scenario.group).files,
  });
  return { outcome, note, runCommand };
}

/** Build the report for one enumeration's worth of scenarios. Scans each
 * group's markers once, not once per scenario, and loads
 * `entry-points.json` once for the whole run. */
export async function buildReport(cwd: string, scenarios: EnumeratedScenario[]): Promise<ScenarioReport[]> {
  const ctx: BuildContext = { cwd, markersByGroup: new Map(), entryPoints: await loadEntryPoints(cwd) };
  const reports: ScenarioReport[] = [];

  for (const scenario of scenarios) {
    const resolved = await resolveOutcome(ctx, scenario);
    reports.push({
      scenarioId: scenario.id,
      group: scenario.group,
      capability: scenario.capability,
      requirementTitle: scenario.requirementTitle,
      scenarioTitle: scenario.scenarioTitle,
      ...resolved,
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
