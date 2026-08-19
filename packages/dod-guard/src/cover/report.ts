/**
 * The coverage report: bound (a marker names this scenario) or unwired (no
 * marker does). `cover` never runs a test - it scans markers by regex.
 */
import type { EnumeratedScenario } from "./enumerate.js";
import { scanMarkers } from "./markers.js";
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

const LANGUAGE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  [".ts", "typescript"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
  [".rb", "ruby"],
  [".java", "java"],
  [".kt", "kotlin"],
  [".sh", "shell"],
  [".bash", "shell"],
]);

function reportBinding(file: string, testName: string): ScenarioBinding {
  const language = LANGUAGE_BY_EXTENSION.get(path.extname(file).toLowerCase()) ?? "unknown";
  return {
    testFile: file,
    testName,
    language,
    unresolvedReason: `no runner command is configured for ${language} test files`,
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
    const reportedBinding = binding ? reportBinding(binding.file, binding.testName) : undefined;
    reports.push({
      scenarioId: scenario.id,
      group: scenario.group,
      capability: scenario.capability,
      requirementTitle: scenario.requirementTitle,
      scenarioTitle: scenario.scenarioTitle,
      outcome: binding ? "bound" : "unwired",
      ...(reportedBinding ? { binding: reportedBinding } : {}),
      note: binding
        ? `bound to ${binding.testName} in ${binding.file}; ${reportedBinding?.unresolvedReason}`
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
