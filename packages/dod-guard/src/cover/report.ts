/**
 * The coverage report: bound (a marker names this scenario) or unwired (no
 * marker does). `cover` never runs a test - it scans markers by regex.
 */
import type { EnumeratedScenario } from "./enumerate.js";
import { scanMarkers } from "./markers.js";
import { LANG_TABLE } from "./languages.js";
import { loadTestRunnerConfig, type TestRunnerConfigLoadResult } from "./test-runners.js";
import * as path from "node:path";

export type Outcome = "bound" | "unwired";

/** A marker binding discovered for a scenario. A command can be absent when
 * the file has a supported parser but no resolvable whole-file runner. */
export interface ScenarioBinding {
  testFile: string;
  testName: string;
  language: string;
  verifyCmd?: string;
  unresolvedReason?: string;
}

export interface ScenarioReport {
  scenarioId: string;
  group: string;
  capability: string;
  requirementTitle: string;
  scenarioTitle: string;
  outcome: Outcome;
  binding?: ScenarioBinding;
  note: string;
}

export interface ScenarioRegression {
  scenarioId: string;
  before: Outcome;
  now: Outcome;
}

/** The result shared by command-line and plugin coverage callers. */
export interface CoverageGateResult {
  reports: ScenarioReport[];
  adopted: string[];
  regressions: ScenarioRegression[];
  improved: string[];
  orphaned: string[];
  planComplete?: number;
  planBound?: number;
}

function reportBinding(file: string, testName: string, workspaceRoot: string, runnerConfig: TestRunnerConfigLoadResult): ScenarioBinding {
  const adapter = LANG_TABLE.get(path.extname(file).toLowerCase());
  const language = adapter?.language ?? "unknown";
  const resolution = adapter?.resolveWholeFileCommand({
    workspaceRoot,
    testFile: file,
    projectConfig: "config" in runnerConfig ? runnerConfig.config : {},
    ...("unresolvedReason" in runnerConfig ? { configError: runnerConfig.unresolvedReason } : {}),
  }) ?? { unresolvedReason: `no runner command is configured for ${language} test files` };
  return {
    testFile: file,
    testName,
    language,
    ...("command" in resolution ? { verifyCmd: resolution.command } : { unresolvedReason: resolution.unresolvedReason }),
  };
}

/** Build the report for one enumeration's worth of scenarios. Scans each
 * group's markers once, not once per scenario. */
export async function buildReport(cwd: string, scenarios: EnumeratedScenario[]): Promise<ScenarioReport[]> {
  const markersByGroup = new Map<string, Awaited<ReturnType<typeof scanMarkers>>>();
  const reports: ScenarioReport[] = [];
  const runnerConfig = await loadTestRunnerConfig(cwd);

  for (const scenario of scenarios) {
    let markers = markersByGroup.get(scenario.group);
    if (!markers) {
      markers = await scanMarkers(cwd, scenario.group);
      markersByGroup.set(scenario.group, markers);
    }
    const binding = markers.get(scenario.id);
    const reportedBinding = binding ? reportBinding(binding.file, binding.testName, cwd, runnerConfig) : undefined;
    reports.push({
      scenarioId: scenario.id,
      group: scenario.group,
      capability: scenario.capability,
      requirementTitle: scenario.requirementTitle,
      scenarioTitle: scenario.scenarioTitle,
      outcome: binding ? "bound" : "unwired",
      ...(reportedBinding ? { binding: reportedBinding } : {}),
      note: binding
        ? `bound to ${binding.testName} in ${binding.file}${reportedBinding?.verifyCmd ? `; verify with ${reportedBinding.verifyCmd}` : `; ${reportedBinding?.unresolvedReason}`}`
        : "no test binds this scenario",
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
