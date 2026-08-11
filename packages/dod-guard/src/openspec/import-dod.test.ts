import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { renderAndImportDod } from "./import-dod.js";
import type { OpenSpecInstructions } from "./types.js";

// `handleDodImport` writes into `~/.claude/dod-store/` unless
// `DOD_STORE_DIR` overrides it (see store.ts's `getStoreDir`). Point every
// test at a fresh temp directory so nothing here touches the real store,
// and so a second run of this test never trips the "Already tracked as"
// refusal a stable path would hit on the real store.
let storeDir: string;

beforeEach(async () => {
  storeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-store-"));
  process.env.DOD_STORE_DIR = storeDir;
});

afterEach(async () => {
  delete process.env.DOD_STORE_DIR;
  await fs.rm(storeDir, { recursive: true, force: true });
});

async function instructionsFor(specContent: string, changeDir: string): Promise<OpenSpecInstructions> {
  await fs.mkdir(join(changeDir, "specs"), { recursive: true });
  await fs.writeFile(join(changeDir, "specs", "delta.md"), specContent, "utf-8");
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

test("renderAndImportDod writes dod.md into the change dir and registers reported counts matching the fixture", async () => {
  const changeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-change-"));
  const instructions = await instructionsFor(
    [
      "### Requirement: Build passes",
      "",
      "#### Scenario: Tests run clean",
      "- **WHEN** the suite runs",
      "- **THEN** `npm --version` exits zero",
      "",
      "### Requirement: Prose quality",
      "",
      "#### Scenario: Reviewer checks tone",
      "- **WHEN** a reviewer reads the summary",
      "- **THEN** the summary reads clearly and stays on topic",
      "",
    ].join("\n"),
    changeDir,
  );

  const report = await renderAndImportDod(instructions);

  // The fixture has exactly one checkable scenario (concrete leaf, one
  // command) and one uncheckable scenario (draft leaf) - so both counts
  // are pinned and cannot both be satisfied by accident.
  assert.match(report, /Concrete proofs: 1/);
  assert.match(report, /Draft nodes: 1/);

  const rendered = await fs.readFile(join(changeDir, "dod.md"), "utf-8");
  assert.match(rendered, /npm --version/);

  await fs.rm(changeDir, { recursive: true, force: true });
});
