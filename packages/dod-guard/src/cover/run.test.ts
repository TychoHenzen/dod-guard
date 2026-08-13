import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { captureIo } from "../testing/capture-io.js";
import { writeUnwiredCoverageGateSpec } from "../testing/spec-fixtures.js";
import { runCover } from "./run.js";

describe("runCover", () => {
  let cwd: string;

  before(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-run-cover-"));
    await writeUnwiredCoverageGateSpec(cwd);
  });

  after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("errors with the usage exit code when neither a change id nor --all is given", async () => {
    const { io, err } = captureIo();
    const code = await runCover({ cwd, all: false, writeBaseline: false }, io);
    assert.equal(code, 3);
    assert.match(err(), /needs a change id or --all/);
  });

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

  it("reports OK with no regressions once the baseline already holds the scenario", async () => {
    const { io, out } = captureIo();
    const code = await runCover({ cwd, all: true, writeBaseline: false }, io);
    assert.equal(code, 0);
    assert.match(out(), /cover OK - 0 regression\(s\)/);
  });
});
