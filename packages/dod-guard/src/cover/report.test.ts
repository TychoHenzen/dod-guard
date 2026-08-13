import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { EnumeratedScenario } from "./enumerate.js";
import { buildReport, outcomeRank, type ScenarioReport, summarizeReport } from "./report.js";

// buildReport's own logic (marker lookup, cache-per-group, assembling a
// ScenarioReport) is what these tests cover. The reachability check itself -
// pass/fail, integrated/not - is reachability.test.ts's job; this file only
// needs one real bound scenario to prove buildReport actually calls it.

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "tools", "openspec-dashboard", "__report_test_fixture__");
const TEST_FILE = path.join(FIXTURE_DIR, "sample.test.js");

function scenario(overrides: Partial<EnumeratedScenario>): EnumeratedScenario {
  return {
    id: "dod-guard/coverage-gate::req||scenario",
    group: "openspec-dashboard",
    capability: "coverage-gate",
    requirementTitle: "req",
    scenarioTitle: "scenario",
    intent: "",
    specPath: "openspec/specs/dod-guard/coverage-gate/spec.md",
    ...overrides,
  };
}

before(async () => {
  await fs.mkdir(FIXTURE_DIR, { recursive: true });
  await fs.writeFile(
    TEST_FILE,
    [
      'import { test } from "node:test";',
      "",
      "// covers: dod-guard/coverage-gate :: req :: bound-scenario",
      'test("a bound test", () => {});',
      "",
    ].join("\n"),
  );
});

after(async () => {
  await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
});

test("buildReport reports an unbound scenario as unwired", async () => {
  const [report] = await buildReport(REPO_ROOT, [
    scenario({ id: "dod-guard/coverage-gate::req||unbound-scenario", scenarioTitle: "unbound-scenario" }),
  ]);
  assert.equal(report.outcome, "unwired");
  assert.match(report.note, /no test binds this scenario/);
});

test("buildReport reports a bound, passing scenario with no declared entry points as covered-but-not-integrated", async () => {
  const [report] = await buildReport(REPO_ROOT, [
    scenario({ id: "dod-guard/coverage-gate::req||bound-scenario", scenarioTitle: "bound-scenario" }),
  ]);
  assert.equal(report.outcome, "covered-but-not-integrated");
  assert.match(report.note, /no entry points declared/);
});

test("outcomeRank orders covered-and-integrated above covered-but-not-integrated above unwired and failed", () => {
  assert.ok(outcomeRank("covered-and-integrated") > outcomeRank("covered-but-not-integrated"));
  assert.ok(outcomeRank("covered-but-not-integrated") > outcomeRank("unwired"));
  assert.equal(outcomeRank("unwired"), outcomeRank("failed"));
});

function report(scenarioId: string, outcome: ScenarioReport["outcome"]): ScenarioReport {
  return {
    scenarioId,
    group: "g",
    capability: "c",
    requirementTitle: "r",
    scenarioTitle: scenarioId,
    outcome,
    note: "",
    runCommand: undefined,
  };
}

test("summarizeReport counts each outcome", () => {
  const summary = summarizeReport([
    report("a", "unwired"),
    report("b", "unwired"),
    report("c", "covered-and-integrated"),
  ]);
  assert.equal(summary.unwired, 2);
  assert.equal(summary["covered-and-integrated"], 1);
  assert.equal(summary["covered-but-not-integrated"], 0);
});
