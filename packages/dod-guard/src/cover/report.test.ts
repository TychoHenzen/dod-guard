import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { EnumeratedScenario } from "./enumerate.js";
import {
  buildReport,
  outcomeRank,
  type CoverageGateResult,
  type ScenarioReport,
  summarizeReport,
} from "./report.js";

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

// covers: dod-guard/coverage-gate :: cover reports a scenario's state :: No test binds a scenario
test("buildReport reports an unbound scenario as unwired", async () => {
  const [report] = await buildReport(REPO_ROOT, [
    scenario({ id: "dod-guard/coverage-gate::req||unbound-scenario", scenarioTitle: "unbound-scenario" }),
  ]);
  assert.equal(report.outcome, "unwired");
  assert.match(report.note, /no test binds this scenario/);
});

// covers: dod-guard/coverage-gate :: cover reports a scenario's state :: A marker binds a scenario to a test
test("buildReport reports a bound scenario as bound", async () => {
  const [report] = await buildReport(REPO_ROOT, [
    scenario({ id: "dod-guard/coverage-gate::req||bound-scenario", scenarioTitle: "bound-scenario" }),
  ]);
  assert.equal(report.outcome, "bound");
  assert.match(report.note, /bound to/);
});

test("CoverageGateResult keeps binding and gate metadata structured", () => {
  const result: CoverageGateResult = {
    reports: [
      {
        ...report("dod-guard/coverage-gate::req||bound-scenario", "bound"),
        binding: {
          testFile: "packages/dod-guard/src/cover/report.test.ts",
          testName: "a bound test",
          language: "typescript",
          verifyCmd: "node --test packages/dod-guard/src/cover/report.test.ts",
        },
      },
    ],
    adopted: ["dod-guard/coverage-gate::req||bound-scenario"],
    regressions: [{ scenarioId: "dod-guard/coverage-gate::req||unwired-scenario", before: "bound", now: "unwired" }],
    improved: ["dod-guard/coverage-gate::req||bound-scenario"],
    orphaned: ["dod-guard/coverage-gate::req||removed-scenario"],
    planComplete: 4,
    planBound: 5,
  };

  assert.equal(result.reports[0].binding?.verifyCmd, "node --test packages/dod-guard/src/cover/report.test.ts");
  assert.equal(result.regressions[0].before, "bound");
});

test("outcomeRank orders bound above unwired", () => {
  assert.ok(outcomeRank("bound") > outcomeRank("unwired"));
});

test("outcomeRank treats old baseline values as equivalent to bound", () => {
  assert.equal(outcomeRank("covered-and-integrated"), outcomeRank("bound"));
  assert.equal(outcomeRank("covered-but-not-integrated"), outcomeRank("bound"));
});

test("outcomeRank treats old failed as equivalent to unwired", () => {
  assert.equal(outcomeRank("failed"), outcomeRank("unwired"));
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
  };
}

test("summarizeReport counts each outcome", () => {
  const summary = summarizeReport([report("a", "unwired"), report("b", "unwired"), report("c", "bound")]);
  assert.equal(summary.unwired, 2);
  assert.equal(summary.bound, 1);
});
