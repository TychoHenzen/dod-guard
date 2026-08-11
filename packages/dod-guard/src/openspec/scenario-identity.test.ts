import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { TaskNode } from "../types.js";
import { buildScenarioMap, readScenarioMap, scenarioKey, writeScenarioMap } from "./scenario-identity.js";

let dir: string;
let resolvedOutputPath: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-scenario-map-"));
  resolvedOutputPath = join(dir, "dod.md");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

test("readScenarioMap returns an empty array when no sidecar has been written", async () => {
  const map = await readScenarioMap(resolvedOutputPath);
  assert.deepEqual(map, []);
});

test("writeScenarioMap then readScenarioMap round-trips the entries", async () => {
  const entries = [{ groupTitle: "Regeneration", scenarioTitle: "Keeps passing", nodeId: "node-1" }];
  await writeScenarioMap(resolvedOutputPath, entries);

  const map = await readScenarioMap(resolvedOutputPath);
  assert.deepEqual(map, entries);
});

test("scenarioKey joins the group and scenario titles so distinct pairs never collide", () => {
  assert.equal(scenarioKey("Regeneration", "Keeps passing"), "Regeneration||Keeps passing");
  assert.notEqual(scenarioKey("Regen", "eration||Keeps passing"), scenarioKey("Regeneration", "Keeps passing"));
});

function leaf(id: string, title: string): TaskNode {
  return { id, title, refinement: "concrete", last_status: "pending" };
}

test("buildScenarioMap zips the converted tree's real titles onto the imported doc's node ids by position", () => {
  const convertedRoots: TaskNode[] = [
    {
      id: "req-0",
      title: "Regeneration",
      refinement: "draft",
      last_status: "draft",
      children: [leaf("req-0-scenario-0", "Keeps passing"), leaf("req-0-scenario-1", "Will change")],
    },
  ];
  const importedRoots: TaskNode[] = [
    {
      id: "node-0",
      title: "Regeneration",
      refinement: "draft",
      last_status: "draft",
      children: [leaf("node-1", "exits zero for the keeps-passing scenario"), leaf("node-2", "exits zero too")],
    },
  ];

  const map = buildScenarioMap(convertedRoots, importedRoots);

  assert.deepEqual(map, [
    { groupTitle: "Regeneration", scenarioTitle: "Keeps passing", nodeId: "node-1" },
    { groupTitle: "Regeneration", scenarioTitle: "Will change", nodeId: "node-2" },
  ]);
});

test("buildScenarioMap skips a scenario the imported tree has no matching leaf for", () => {
  const convertedRoots: TaskNode[] = [
    {
      id: "req-0",
      title: "Regeneration",
      refinement: "draft",
      last_status: "draft",
      children: [leaf("req-0-scenario-0", "Only scenario")],
    },
  ];
  const importedRoots: TaskNode[] = [
    { id: "node-0", title: "Regeneration", refinement: "draft", last_status: "draft", children: [] },
  ];

  const map = buildScenarioMap(convertedRoots, importedRoots);

  assert.deepEqual(map, []);
});
