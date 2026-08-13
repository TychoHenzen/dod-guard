import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import type { EnumeratedScenario } from "./enumerate.js";
import { buildReport, outcomeRank, summarizeReport } from "./report.js";

let cwd: string;

function scenario(overrides: Partial<EnumeratedScenario>): EnumeratedScenario {
  return {
    id: "dod-guard/coverage-gate::req||scenario",
    group: "dod-guard",
    capability: "coverage-gate",
    requirementTitle: "req",
    scenarioTitle: "scenario",
    intent: "",
    specPath: "openspec/specs/dod-guard/coverage-gate/spec.md",
    ...overrides,
  };
}

before(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-report-"));
  const testFile = path.join(cwd, "packages", "dod-guard", "src", "cover", "report.test.ts");
  await fs.mkdir(path.dirname(testFile), { recursive: true });
  await fs.writeFile(
    testFile,
    ["// covers: dod-guard/coverage-gate :: req :: bound-scenario", 'test("a bound test", () => {});', ""].join("\n"),
  );
});

after(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

test("buildReport reports an unbound scenario as unwired", async () => {
  const [report] = await buildReport(cwd, [
    scenario({ id: "dod-guard/coverage-gate::req||unbound-scenario", scenarioTitle: "unbound-scenario" }),
  ]);
  assert.equal(report.outcome, "unwired");
  assert.match(report.note, /no test binds this scenario/);
});

test("buildReport reports a bound scenario as covered-but-not-integrated in 3a", async () => {
  const [report] = await buildReport(cwd, [
    scenario({ id: "dod-guard/coverage-gate::req||bound-scenario", scenarioTitle: "bound-scenario" }),
  ]);
  assert.equal(report.outcome, "covered-but-not-integrated");
  assert.match(report.note, /a bound test/);
});

test("outcomeRank orders covered-and-integrated above covered-but-not-integrated above unwired and failed", () => {
  assert.ok(outcomeRank("covered-and-integrated") > outcomeRank("covered-but-not-integrated"));
  assert.ok(outcomeRank("covered-but-not-integrated") > outcomeRank("unwired"));
  assert.equal(outcomeRank("unwired"), outcomeRank("failed"));
});

test("summarizeReport counts each outcome", () => {
  const summary = summarizeReport([
    {
      scenarioId: "a",
      group: "g",
      capability: "c",
      requirementTitle: "r",
      scenarioTitle: "s1",
      outcome: "unwired",
      note: "",
    },
    {
      scenarioId: "b",
      group: "g",
      capability: "c",
      requirementTitle: "r",
      scenarioTitle: "s2",
      outcome: "unwired",
      note: "",
    },
    {
      scenarioId: "c",
      group: "g",
      capability: "c",
      requirementTitle: "r",
      scenarioTitle: "s3",
      outcome: "covered-and-integrated",
      note: "",
    },
  ]);
  assert.equal(summary.unwired, 2);
  assert.equal(summary["covered-and-integrated"], 1);
  assert.equal(summary["covered-but-not-integrated"], 0);
});
