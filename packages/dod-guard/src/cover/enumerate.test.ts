import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { enumerateAllScenarios, enumerateChangeScenarios } from "./enumerate.js";

let cwd: string;

before(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-enumerate-"));

  const mainSpec = path.join(cwd, "openspec", "specs", "dod-guard", "coverage-gate", "spec.md");
  await fs.mkdir(path.dirname(mainSpec), { recursive: true });
  await fs.writeFile(
    mainSpec,
    [
      "## Requirements",
      "",
      "### Requirement: cover reports a scenario's state",
      "",
      "#### Scenario: unwired",
      "- **WHEN** no test binds to a scenario",
      "- **THEN** cover reports it as unwired",
      "",
    ].join("\n"),
  );

  const deltaSpec = path.join(
    cwd,
    "openspec",
    "changes",
    "add-thing",
    "specs",
    "dod-guard",
    "coverage-gate",
    "spec.md",
  );
  await fs.mkdir(path.dirname(deltaSpec), { recursive: true });
  await fs.writeFile(
    deltaSpec,
    [
      "## ADDED Requirements",
      "",
      "### Requirement: a new requirement",
      "",
      "#### Scenario: a new scenario",
      "- **WHEN** something happens",
      "- **THEN** something else happens",
      "",
    ].join("\n"),
  );
});

after(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

test("enumerateAllScenarios reads the main spec tree, not a change's deltas", async () => {
  const scenarios = await enumerateAllScenarios(cwd);
  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0].id, "dod-guard/coverage-gate::cover reports a scenario's state||unwired");
  assert.equal(scenarios[0].group, "dod-guard");
  assert.equal(scenarios[0].capability, "coverage-gate");
});

test("enumerateChangeScenarios reads one change's deltas, not the main tree", async () => {
  const scenarios = await enumerateChangeScenarios(cwd, "add-thing");
  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0].id, "dod-guard/coverage-gate::a new requirement||a new scenario");
});

test("enumerateChangeScenarios returns nothing for a change with no specs directory", async () => {
  const scenarios = await enumerateChangeScenarios(cwd, "no-such-change");
  assert.deepEqual(scenarios, []);
});
