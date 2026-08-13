import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { entryPointsForGroup, loadEntryPoints } from "./entry-points.js";

let cwd: string;

before(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-entry-points-"));
  await fs.mkdir(path.join(cwd, "openspec"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, "openspec", "entry-points.json"),
    JSON.stringify({ "packages/dod-guard": ["packages/dod-guard/src/cli.ts"] }),
  );
});

after(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

test("loadEntryPoints reads the declared file", async () => {
  const entryPoints = await loadEntryPoints(cwd);
  assert.deepEqual(entryPoints["packages/dod-guard"], ["packages/dod-guard/src/cli.ts"]);
});

test("loadEntryPoints returns an empty object when the file is missing", async () => {
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-entry-points-missing-"));
  try {
    assert.deepEqual(await loadEntryPoints(empty), {});
  } finally {
    await fs.rm(empty, { recursive: true, force: true });
  }
});

test("entryPointsForGroup finds a declared package by its group name", async () => {
  const entryPoints = await loadEntryPoints(cwd);
  const result = entryPointsForGroup(entryPoints, "dod-guard");
  assert.equal(result.declared, true);
  assert.deepEqual(result.files, ["packages/dod-guard/src/cli.ts"]);
});

test("entryPointsForGroup reports undeclared for a group with no key", async () => {
  const entryPoints = await loadEntryPoints(cwd);
  const result = entryPointsForGroup(entryPoints, "evomcp");
  assert.equal(result.declared, false);
  assert.deepEqual(result.files, []);
});
