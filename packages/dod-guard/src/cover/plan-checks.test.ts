import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { captureIo } from "../testing/capture-io.js";
import { writeChangeSpecDelta, writeChangeTasks, writeUnwiredCoverageGateSpec } from "../testing/spec-fixtures.js";
import { runCover } from "./run.js";

/** A finished plan whose one item names nothing. */
const UNANNOTATED = ["## 1. Build it", "", "- [ ] 1.1 do the work", ""].join("\n");

/** A finished plan whose one item names the scenario writeChangeSpecDelta creates. */
const ANNOTATED = [
  "## 1. Build it",
  "",
  "- [ ] 1.1 do the work",
  "<!-- covers: dod-guard/coverage-gate :: a new requirement :: a new scenario -->",
  "",
].join("\n");

describe("the plan-unbound check", () => {
  let cwd: string;

  before(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-plan-checks-"));
    await writeUnwiredCoverageGateSpec(cwd);
  });

  after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  // covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: A finished plan naming nothing is refused
  it("names the missed scenarios and returns the plan-unbound code", async () => {
    await writeChangeSpecDelta(cwd, "builds-nothing");
    await writeChangeTasks(cwd, "builds-nothing", UNANNOTATED);

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "builds-nothing", all: false, writeBaseline: false }, io);

    assert.equal(code, 5);
    assert.match(out(), /plan unbound - 1 scenario\(s\), named by no task in the plan/);
    assert.match(out(), /a new requirement\|\|a new scenario/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: A plan is judged on its own annotations, not on tests
  it("passes a plan that names its scenario even though no test binds it yet", async () => {
    await writeChangeSpecDelta(cwd, "planned-not-built");
    await writeChangeTasks(cwd, "planned-not-built", ANNOTATED);

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "planned-not-built", all: false, writeBaseline: false }, io);

    assert.equal(code, 0);
    assert.match(out(), /1 scenario\(s\): 0 bound, 1 unwired/);
    assert.doesNotMatch(out(), /plan unbound/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: An annotation naming a scenario the change does not have is not enough
  it("refuses a plan whose annotation names a scenario outside the change", async () => {
    await writeChangeSpecDelta(cwd, "wrong-target");
    await writeChangeTasks(
      cwd,
      "wrong-target",
      [
        "## 1. Build it",
        "",
        "- [ ] 1.1 do the work",
        "<!-- covers: some/other :: no such requirement :: no such scenario -->",
        "",
      ].join("\n"),
    );

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "wrong-target", all: false, writeBaseline: false }, io);

    assert.equal(code, 5);
    assert.match(out(), /plan unbound/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: Annotations that named nothing are reported with the expected format
  it("counts the annotations that named nothing and gives the expected format", async () => {
    await writeChangeSpecDelta(cwd, "malformed-annotations");
    await writeChangeTasks(
      cwd,
      "malformed-annotations",
      [
        "## 1. Build it",
        "",
        "- [ ] 1.1 do the work",
        "  <!-- covers: dod-guard/coverage-gate -->",
        "- [ ] 1.2 do more work",
        "  <!-- covers: dod-guard/coverage-gate -->",
        "",
      ].join("\n"),
    );

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "malformed-annotations", all: false, writeBaseline: false }, io);

    assert.equal(code, 5);
    assert.match(out(), /2 covers annotation\(s\) in tasks\.md, none naming a scenario above \(0 parsed\)/);
    assert.match(out(), /format: <!-- covers: <group>\/<capability> :: <requirement title> :: <scenario title> -->/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: An unexpanded group is reported before an unannotated plan
  it("reports an unexpanded group instead of an unannotated plan", async () => {
    await writeChangeSpecDelta(cwd, "half-written");
    await writeChangeTasks(
      cwd,
      "half-written",
      ["## 1. Build it", "", "- [ ] 1.1 do the work", "", "## 2. Later", ""].join("\n"),
    );

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "half-written", all: false, writeBaseline: false }, io);

    assert.equal(code, 4);
    assert.match(out(), /plan incomplete/);
    assert.doesNotMatch(out(), /plan unbound/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: A change with no spec deltas is not refused
  it("does not refuse a change whose deltas yield no scenario", async () => {
    await writeChangeTasks(cwd, "no-deltas", UNANNOTATED);

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "no-deltas", all: false, writeBaseline: false }, io);

    assert.equal(code, 0);
    assert.match(out(), /Nothing to cover/);
    assert.doesNotMatch(out(), /plan unbound/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: An --all run skips the check
  it("skips the check on an --all run", async () => {
    await writeChangeSpecDelta(cwd, "all-run-trap");
    await writeChangeTasks(cwd, "all-run-trap", UNANNOTATED);

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "all-run-trap", all: true, writeBaseline: false }, io);

    assert.equal(code, 0);
    assert.doesNotMatch(out(), /plan unbound/);
  });

  // covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: A change with no tasks.md is not judged
  it("does not judge a change that has no tasks.md at all", async () => {
    await writeChangeSpecDelta(cwd, "unplanned");

    const { io, out } = captureIo();
    const code = await runCover({ cwd, changeId: "unplanned", all: false, writeBaseline: false }, io);

    assert.equal(code, 0);
    assert.doesNotMatch(out(), /plan unbound/);
  });
});
