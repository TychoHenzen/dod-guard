import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { scanMarkers } from "./markers.js";

let cwd: string;

before(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-markers-"));

  const testFile = path.join(cwd, "packages", "dod-guard", "src", "cover", "report.test.ts");
  await fs.mkdir(path.dirname(testFile), { recursive: true });
  await fs.writeFile(
    testFile,
    [
      'import { test } from "node:test";',
      "",
      "// covers: dod-guard/coverage-gate :: cover reports a scenario's state :: unwired",
      'test("cover reports a scenario with no bound test as unwired", async () => {});',
      "",
      "// covers: dod-guard/coverage-gate :: cover reports a scenario's state :: covered",
      "",
      'it("cover reports a bound scenario as covered", async () => {});',
      "",
      "// covers: dod-guard/coverage-gate :: a marker with nothing after it :: dangling",
      "",
    ].join("\n"),
  );
});

after(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

test("scanMarkers binds a scenario to the test on the very next line", async () => {
  const bindings = await scanMarkers(cwd, "dod-guard");
  const binding = bindings.get("dod-guard/coverage-gate::cover reports a scenario's state||unwired");
  assert.ok(binding);
  assert.equal(binding.testName, "cover reports a scenario with no bound test as unwired");
});

test("scanMarkers skips blank lines between the marker and an it() call", async () => {
  const bindings = await scanMarkers(cwd, "dod-guard");
  const binding = bindings.get("dod-guard/coverage-gate::cover reports a scenario's state||covered");
  assert.ok(binding);
  assert.equal(binding.testName, "cover reports a bound scenario as covered");
});

test("scanMarkers drops a marker with no test call after it", async () => {
  const bindings = await scanMarkers(cwd, "dod-guard");
  assert.equal(bindings.has("dod-guard/coverage-gate::a marker with nothing after it||dangling"), false);
});

test("scanMarkers returns an empty map for a group with no test files", async () => {
  const bindings = await scanMarkers(cwd, "no-such-group");
  assert.equal(bindings.size, 0);
});
