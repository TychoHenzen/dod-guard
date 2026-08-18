import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { captureIo } from "../testing/capture-io.js";
import { writeChangeSpecDelta, writeChangeTasks, writeUnwiredCoverageGateSpec } from "../testing/spec-fixtures.js";
import { runCover } from "./run.js";

/** Names the scenario writeChangeSpecDelta creates, so a finished plan reads as annotated. */
const COVERS = "<!-- covers: dod-guard/coverage-gate :: a new requirement :: a new scenario -->";

describe("runCover", () => {
  let cwd: string;

  before(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-run-cover-"));
    await writeUnwiredCoverageGateSpec(cwd);
  });

  after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  // covers: dod-guard/coverage-gate :: cover enumerates scenarios from a change's deltas or the main spec tree :: Neither a change id nor --all is given
  it("errors with the usage exit code when neither a change id nor --all is given", async () => {
    const { io, err } = captureIo();
    const code = await runCover({ cwd, all: false, writeBaseline: false }, io);
    assert.equal(code, 3);
    assert.match(err(), /needs a change id or --all/);
  });

  // covers: dod-guard/coverage-gate :: The coverage-gate ratchet adopts unseen scenarios and blocks on regression :: --write-baseline records the current report as the new baseline
  it("errors with the usage exit code when --write-baseline is given without --all", async () => {
    const { io, err } = captureIo();
    const code = await runCover({ cwd, changeId: "some-change", all: false, writeBaseline: true }, io);
    assert.equal(code, 3);
    assert.match(err(), /--write-baseline needs --all/);
  });

  it("returns nothing-to-cover for a change with no spec deltas", async () => {
    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "no-such-change", all: false, writeBaseline: false }, io);
    assert.equal(code, 0);
    assert.match(out(), /Nothing to cover/);
  });

  // covers: dod-guard/coverage-gate :: The coverage-gate ratchet adopts unseen scenarios and blocks on regression :: --write-baseline records the current report as the new baseline
  it("writes a fresh baseline and reports the scenario as unwired", async () => {
    const { io, out } = captureIo();
    const code = await runCover({ cwd, all: true, writeBaseline: true }, io);
    assert.equal(code, 0);
    assert.match(out(), /unwired/);
    assert.match(out(), /wrote coverage-gate baseline for 1 scenario/);

    const written = JSON.parse(
      await fs.readFile(path.join(cwd, ".github", "quality", "coverage-gate-baseline.json"), "utf-8"),
    );
    assert.equal(written.scenarios["dod-guard/coverage-gate::cover reports a scenario's state||unwired"], "unwired");
  });

  // covers: dod-guard/coverage-gate :: The coverage-gate ratchet adopts unseen scenarios and blocks on regression :: A scenario that stays unwired is not a regression
  it("reports OK with no regressions once the baseline already holds the scenario", async () => {
    const { io, out } = captureIo();
    const code = await runCover({ cwd, all: true, writeBaseline: false }, io);
    assert.equal(code, 0);
    assert.match(out(), /cover OK - 0 regression\(s\)/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a change whose task groups are not expanded :: A fully expanded plan passes the check
  it("performs no plan-incomplete report when every group carries a checkbox", async () => {
    await writeChangeSpecDelta(cwd, "add-widget");
    await writeChangeTasks(cwd, "add-widget", ["## 1. Setup", "", "- [ ] 1.1 do something", COVERS, ""].join("\n"));

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "add-widget", all: false, writeBaseline: false }, io);
    assert.equal(code, 0);
    assert.doesNotMatch(out(), /plan incomplete/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a change whose task groups are not expanded :: A change with no tasks.md is not blocked by this check
  it("performs no plan-incomplete report for a change with no tasks.md", async () => {
    await writeChangeSpecDelta(cwd, "add-sprocket");

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "add-sprocket", all: false, writeBaseline: false }, io);
    assert.equal(code, 0);
    assert.doesNotMatch(out(), /plan incomplete/);
  });

  it("names an unexpanded group and returns the plan-incomplete exit code", async () => {
    await writeChangeSpecDelta(cwd, "add-gadget");
    await writeChangeTasks(
      cwd,
      "add-gadget",
      ["## 1. Setup", "", "- [ ] 1.1 do something", "", "## 2. Baseline adoption", ""].join("\n"),
    );

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "add-gadget", all: false, writeBaseline: false }, io);
    assert.equal(code, 4);
    assert.match(out(), /plan incomplete - 1 unexpanded group: 2\. Baseline adoption/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a change whose task groups are not expanded :: A prose heading is not a group heading
  it("does not treat a prose heading or a subheading as a group", async () => {
    await writeChangeSpecDelta(cwd, "add-fixture");
    await writeChangeTasks(
      cwd,
      "add-fixture",
      [
        "# Tasks",
        "",
        "## 1. Real group",
        "",
        "- [ ] 1.1 do something",
        COVERS,
        "",
        "## Notes",
        "",
        "some prose with no checkbox",
        "",
        "### Working memory",
        "",
        "more prose with no checkbox",
        "",
      ].join("\n"),
    );

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "add-fixture", all: false, writeBaseline: false }, io);
    assert.equal(code, 0);
    assert.doesNotMatch(out(), /plan incomplete/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a change whose task groups are not expanded :: An --all run skips the check
  it("skips the plan-incomplete check on an --all run even when a change id names an unexpanded group", async () => {
    await writeChangeSpecDelta(cwd, "add-trap");
    await writeChangeTasks(
      cwd,
      "add-trap",
      ["## 1. Setup", "", "- [ ] 1.1 do something", "", "## 2. Unexpanded", ""].join("\n"),
    );

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "add-trap", all: true, writeBaseline: false }, io);
    assert.equal(code, 0);
    assert.doesNotMatch(out(), /plan incomplete/);
  });
});
