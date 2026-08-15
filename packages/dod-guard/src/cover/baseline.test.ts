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
  };
}

test("readBaseline returns an empty object when no baseline file exists yet", async () => {
  await withTempCwd(async (cwd) => {
    assert.deepEqual(await readBaseline(cwd), {});
  });
});

// covers: dod-guard/coverage-gate :: The coverage-gate ratchet adopts unseen scenarios and blocks on regression :: --write-baseline records the current report as the new baseline
test("writeBaseline then readBaseline round-trips the scenario outcomes", async () => {
  await withTempCwd(async (cwd) => {
    await writeBaseline(cwd, { "a::x||y": "bound" });
    assert.deepEqual(await readBaseline(cwd), { "a::x||y": "bound" });
  });
});

// covers: dod-guard/coverage-gate :: The coverage-gate ratchet adopts unseen scenarios and blocks on regression :: A scenario absent from the baseline is adopted
test("compareToBaseline adopts a scenario id absent from the baseline", () => {
  const { adopted, regressions } = compareToBaseline([report("new-scenario", "unwired")], {});
  assert.deepEqual(adopted, ["new-scenario"]);
  assert.deepEqual(regressions, []);
});

// covers: dod-guard/coverage-gate :: The coverage-gate ratchet adopts unseen scenarios and blocks on regression :: A scenario that stays unwired is not a regression
test("compareToBaseline reports no regression when a scenario holds its outcome", () => {
  const { regressions } = compareToBaseline([report("s", "bound")], { s: "bound" });
  assert.deepEqual(regressions, []);
});

// covers: dod-guard/coverage-gate :: The coverage-gate ratchet adopts unseen scenarios and blocks on regression :: A previously covered-and-integrated scenario regresses
test("compareToBaseline reports a regression from bound to unwired", () => {
  const { regressions } = compareToBaseline([report("s", "unwired")], { s: "bound" });
  assert.equal(regressions.length, 1);
  assert.equal(regressions[0].before, "bound");
  assert.equal(regressions[0].now, "unwired");
});

test("compareToBaseline reports no regression when a scenario stays unwired", () => {
  const { regressions } = compareToBaseline([report("s", "unwired")], { s: "unwired" });
  assert.deepEqual(regressions, []);
});

// covers: dod-guard/coverage-gate :: The coverage-gate ratchet adopts unseen scenarios and blocks on regression :: A previously baselined scenario reaches a better outcome
test("compareToBaseline reports improvement when a baselined scenario reaches a better outcome", () => {
  const { improved, regressions } = compareToBaseline([report("s", "bound")], { s: "unwired" });
  assert.deepEqual(improved, ["s"]);
  assert.deepEqual(regressions, []);
});

test("compareToBaseline does not report a held outcome as improved or an adopted scenario as improved", () => {
  assert.deepEqual(compareToBaseline([report("s", "unwired")], { s: "unwired" }).improved, []);
  const { improved, adopted } = compareToBaseline([report("new", "bound")], {});
  assert.deepEqual(improved, []);
  assert.deepEqual(adopted, ["new"]);
});

test("compareToBaseline treats old covered-* baseline values as equivalent to bound", () => {
  for (const old of ["covered-and-integrated", "covered-but-not-integrated"] as any[]) {
    const { regressions } = compareToBaseline([report("s", "bound")], { s: old });
    assert.deepEqual(regressions, [], `bound should not regress from ${old}`);
  }
});

// covers: dod-guard/coverage-gate :: The coverage-gate ratchet adopts unseen scenarios and blocks on regression :: A baselined scenario id is missing from a whole-tree run
test("findOrphans finds a vanished baseline id", () => {
  const reports = [report("one-of-many", "unwired")];
  const baseline = { "one-of-many": "unwired" as const, elsewhere: "bound" as const };
  assert.deepEqual(findOrphans(reports, baseline), ["elsewhere"]);
  assert.deepEqual(compareToBaseline(reports, baseline).regressions, []);
});

test("outcomesFromReport builds a scenario-id-keyed outcome map", () => {
  const outcomes = outcomesFromReport([report("s1", "unwired"), report("s2", "bound")]);
  assert.deepEqual(outcomes, { s1: "unwired", s2: "bound" });
});
