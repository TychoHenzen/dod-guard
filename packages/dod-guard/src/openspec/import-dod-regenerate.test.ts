import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { renderAndImportDod } from "./import-dod.js";
import type { OpenSpecInstructions } from "./types.js";

// A second `renderAndImportDod` call for the same resolved path is the
// "spec moved on" case - it must regenerate the existing DoD instead of
// silently no-oping the way a bare second `dod_import` would (see
// import-dod.ts). Isolated the same way import-dod.test.ts is.
let storeDir: string;
let changeDir: string;

beforeEach(async () => {
  storeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-store-"));
  process.env.DOD_STORE_DIR = storeDir;
  changeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-change-"));
});

afterEach(async () => {
  delete process.env.DOD_STORE_DIR;
  await fs.rm(storeDir, { recursive: true, force: true });
  await fs.rm(changeDir, { recursive: true, force: true });
});

async function instructionsFor(command: string): Promise<OpenSpecInstructions> {
  const spec = [
    "### Requirement: Build passes",
    "",
    "#### Scenario: Tests run clean",
    "- **WHEN** the suite runs",
    `- **THEN** \`${command}\` exits zero`,
    "",
  ].join("\n");
  await fs.mkdir(join(changeDir, "specs"), { recursive: true });
  await fs.writeFile(join(changeDir, "specs", "delta.md"), spec, "utf-8");
  return {
    changeName: "test-change",
    artifactId: "dod",
    schemaName: "default",
    changeDir,
    planningHome: { kind: "local", root: changeDir, changesDir: changeDir, defaultSchema: "default" },
    outputPath: "dod.md",
    resolvedOutputPath: join(changeDir, "dod.md"),
    existingOutputPaths: [],
    description: "test change description",
    instruction: "",
    template: "",
    dependencies: [{ id: "specs", done: true, path: "specs/**/*.md", description: "" }],
    unlocks: [],
    root: { path: changeDir, source: "test" },
  };
}

test("renderAndImportDod regenerates in place on a second call for the same resolved path", async () => {
  const firstReport = await renderAndImportDod(await instructionsFor("npm --version"));
  assert.match(firstReport, /DoD imported\./);
  const dodId = firstReport.match(/ID: (\S+)/)?.[1];
  assert.ok(dodId, "expected an ID line in the first report");

  const secondReport = await renderAndImportDod(await instructionsFor("node --version"));
  assert.match(secondReport, /DoD regenerated\./);
  assert.match(secondReport, new RegExp(`ID: ${dodId}`));
  assert.match(secondReport, /Amended: 1/);
});
