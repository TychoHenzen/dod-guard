/**
 * The coverage-gate ratchet: adopt a scenario the baseline has never seen at
 * whatever outcome `cover` finds it at; fail only when a scenario the
 * baseline already scored regresses. Structurally the same pattern
 * `scripts/ci/check-coverage.mjs` already uses for
 * `.github/quality/coverage-baseline.json` - read/write/compare, keyed here
 * by scenario id instead of by package.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { type Outcome, outcomeRank, type ScenarioReport } from "./report.js";

const NOTE = "Coverage outcome each scenario holds today. A drop below its own outcome fails the gate.";

function baselinePath(cwd: string): string {
  return path.join(cwd, ".github", "quality", "coverage-gate-baseline.json");
}

export async function readBaseline(cwd: string): Promise<Record<string, Outcome>> {
  try {
    const raw = await fs.readFile(baselinePath(cwd), "utf-8");
    const parsed = JSON.parse(raw) as { scenarios?: Record<string, Outcome> };
    return parsed.scenarios ?? {};
  } catch {
    return {};
  }
}

export async function writeBaseline(cwd: string, current: Record<string, Outcome>): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  await fs.mkdir(path.dirname(baselinePath(cwd)), { recursive: true });
  await fs.writeFile(baselinePath(cwd), `${JSON.stringify({ note: NOTE, scenarios: sorted }, null, 2)}\n`);
}

interface BaselineComparison {
  /** Scenario ids the baseline had never seen; adopted at their current outcome. */
  adopted: string[];
  /** Scenario ids that regressed from the baseline's outcome to a worse one. */
  regressions: { scenarioId: string; before: Outcome; now: Outcome }[];
  /** Scenario ids already in the baseline that reached a better outcome. */
  improved: string[];
}

export function compareToBaseline(reports: ScenarioReport[], baseline: Record<string, Outcome>): BaselineComparison {
  const adopted: string[] = [];
  const regressions: BaselineComparison["regressions"] = [];
  const improved: string[] = [];

  for (const report of reports) {
    const before = baseline[report.scenarioId];
    if (before === undefined) {
      adopted.push(report.scenarioId);
      continue;
    }
    if (outcomeRank(report.outcome) < outcomeRank(before)) {
      regressions.push({ scenarioId: report.scenarioId, before, now: report.outcome });
      continue;
    }
    if (outcomeRank(report.outcome) > outcomeRank(before)) {
      improved.push(report.scenarioId);
    }
  }

  return { adopted, regressions, improved };
}

export function outcomesFromReport(reports: ScenarioReport[]): Record<string, Outcome> {
  return Object.fromEntries(reports.map((r) => [r.scenarioId, r.outcome]));
}
