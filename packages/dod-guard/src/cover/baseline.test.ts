import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { compareToBaseline, findOrphans, outcomesFromReport, readBaseline, writeBaseline } from "./baseline.js";
import type { ScenarioReport } from "./report.js";

async function withTempCwd(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-baseline-"));
  try {
    await run(cwd);
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}

function report(scenarioId: string, outcome: ScenarioReport["outcome"]): ScenarioReport {
  return {
    scenarioId,
    group: "dod-guard",
    capability: "coverage-gate",
    requirementTitle: "r",
    scenarioTitle: "s",
    outcome,
    note: "",
    runCommand: undefined,
  };
}

test("readBaseline returns an empty object when no baseline file exists yet", async () => {
  await withTempCwd(async (cwd) => {
    assert.deepEqual(await readBaseline(cwd), {});
  });
});

test("writeBaseline then readBaseline round-trips the scenario outcomes", async () => {
  await withTempCwd(async (cwd) => {
    await writeBaseline(cwd, { "a::x||y": "covered-and-integrated" });
    assert.deepEqual(await readBaseline(cwd), { "a::x||y": "covered-and-integrated" });
  });
});

test("compareToBaseline adopts a scenario id absent from the baseline", () => {
  const { adopted, regressions } = compareToBaseline([report("new-scenario", "unwired")], {});
  assert.deepEqual(adopted, ["new-scenario"]);
  assert.deepEqual(regressions, []);
});

test("compareToBaseline reports no regression when a scenario holds its outcome", () => {
  const { regressions } = compareToBaseline([report("s", "covered-and-integrated")], { s: "covered-and-integrated" });
  assert.deepEqual(regressions, []);
});

test("compareToBaseline reports a regression from covered-and-integrated to covered-but-not-integrated", () => {
  const { regressions } = compareToBaseline([report("s", "covered-but-not-integrated")], {
    s: "covered-and-integrated",
  });
  assert.equal(regressions.length, 1);
  assert.equal(regressions[0].before, "covered-and-integrated");
  assert.equal(regressions[0].now, "covered-but-not-integrated");
});

test("compareToBaseline reports a regression from covered-but-not-integrated to unwired", () => {
  const { regressions } = compareToBaseline([report("s", "unwired")], { s: "covered-but-not-integrated" });
  assert.equal(regressions.length, 1);
});

test("compareToBaseline reports no regression when a scenario stays unwired", () => {
  const { regressions } = compareToBaseline([report("s", "unwired")], { s: "unwired" });
  assert.deepEqual(regressions, []);
});

test("compareToBaseline reports improvement when a baselined scenario reaches a better outcome", () => {
  const { improved, regressions } = compareToBaseline([report("s", "covered-but-not-integrated")], { s: "unwired" });
  assert.deepEqual(improved, ["s"]);
  assert.deepEqual(regressions, []);
});

test("compareToBaseline reports no improvement when a scenario holds its outcome", () => {
  const { improved } = compareToBaseline([report("s", "unwired")], { s: "unwired" });
  assert.deepEqual(improved, []);
});

test("compareToBaseline does not report an adopted scenario as improved", () => {
  const { improved, adopted } = compareToBaseline([report("new-scenario", "covered-and-integrated")], {});
  assert.deepEqual(improved, []);
  assert.deepEqual(adopted, ["new-scenario"]);
});
test("findOrphans finds a vanished baseline id (only run.ts's --all path calls it); not a regression, no block on pass", () => {
  const reports = [report("one-of-many", "unwired")];
  const baseline = { "one-of-many": "unwired" as const, elsewhere: "covered-and-integrated" as const };
  assert.deepEqual(findOrphans(reports, baseline), ["elsewhere"]);
  assert.deepEqual(compareToBaseline(reports, baseline).regressions, []);
});
test("outcomesFromReport builds a scenario-id-keyed outcome map", () => {
  const outcomes = outcomesFromReport([report("s1", "unwired"), report("s2", "covered-and-integrated")]);
  assert.deepEqual(outcomes, { s1: "unwired", s2: "covered-and-integrated" });
});
