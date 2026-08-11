import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { checkDocument } from "../checker.js";
import { handleDodCheck } from "../mcp/dod-check.js";
import * as store from "../store.js";
import { renderAndImportDod } from "./import-dod.js";
import { regenerateDod } from "./regenerate-dod.js";
import type { OpenSpecInstructions } from "./types.js";

// Isolate the store the same way import-dod.test.ts does - see that file
// for why (DOD_STORE_DIR override, fresh temp dir per test).
let storeDir: string;

beforeEach(async () => {
  storeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-store-"));
  process.env.DOD_STORE_DIR = storeDir;
});

afterEach(async () => {
  delete process.env.DOD_STORE_DIR;
  await fs.rm(storeDir, { recursive: true, force: true });
});

async function instructionsFor(changeDir: string, specContent: string): Promise<OpenSpecInstructions> {
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

function idFrom(report: string): string {
  const match = report.match(/ID: ([^\s]+)/);
  assert.ok(match, `expected an "ID: ..." line in report, got: ${report}`);
  return match?.[1] as string;
}

// Each scenario's THEN text is unique on purpose: a stored leaf's `title`
// is its THEN text, not its scenario heading (see scenario-identity.ts).
const V1_SPEC = [
  "### Requirement: Regeneration",
  "",
  "#### Scenario: Keeps passing",
  "- **WHEN** the leaf is untouched",
  "- **THEN** `npm --version` exits zero for the keeps-passing scenario",
  "",
  "#### Scenario: Will change",
  "- **WHEN** the spec is edited",
  "- **THEN** `npm --version` exits zero for the will-change scenario",
  "",
  "#### Scenario: Will be removed",
  "- **WHEN** the scenario is deleted from the spec",
  "- **THEN** `npm --version` exits zero for the will-be-removed scenario",
  "",
].join("\n");

const V2_SPEC = [
  "### Requirement: Regeneration",
  "",
  "#### Scenario: Keeps passing",
  "- **WHEN** the leaf is untouched",
  "- **THEN** `npm --version` exits zero for the keeps-passing scenario",
  "",
  "#### Scenario: Will change",
  "- **WHEN** the spec is edited",
  "- **THEN** `node --version` exits zero for the will-change scenario, now edited",
  "",
  "#### Scenario: Newly added",
  "- **WHEN** a scenario is added to the spec",
  "- **THEN** `node --version` exits zero for the newly-added scenario",
  "",
].join("\n");

async function buildRegeneratedDoc(changeDir: string) {
  const v1 = await instructionsFor(changeDir, V1_SPEC);
  const report = await renderAndImportDod(v1);
  const dodId = idFrom(report);

  // Run once so "Keeps passing" and "Will change" carry a real recorded
  // verdict before regeneration - proves case 1 preserves the verdict
  // rather than merely never having set one.
  await handleDodCheck({ dod_id: dodId, confirm_import: true });

  const v2 = await instructionsFor(changeDir, V2_SPEC);
  const summary = await regenerateDod(dodId, v2);

  const doc = await store.load(dodId);
  assert.ok(doc, "expected the regenerated doc to still be tracked");
  if (!doc) throw new Error("unreachable");
  return { doc, summary, dodId };
}

test("regenerateDod leaves an untouched leaf's command and recorded verdict alone", async () => {
  const changeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-regen-"));
  const { doc } = await buildRegeneratedDoc(changeDir);

  const group = doc.roots.find((r) => r.title === "Regeneration");
  const leaf = group?.children?.find((c) => c.description?.includes("keeps-passing scenario"));
  assert.ok(leaf, "expected the 'Keeps passing' leaf to survive regeneration");
  assert.equal(leaf?.command, "npm --version");
  assert.equal(leaf?.last_status, "pass");

  await fs.rm(changeDir, { recursive: true, force: true });
});

test("regenerateDod amends a leaf whose scenario text changed, and records an audit entry", async () => {
  const changeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-regen-"));
  const { doc, summary } = await buildRegeneratedDoc(changeDir);

  const group = doc.roots.find((r) => r.title === "Regeneration");
  const leaf = group?.children?.find((c) => c.description?.includes("will-change scenario"));
  assert.ok(leaf, "expected the 'Will change' leaf to still exist");
  assert.equal(leaf?.command, "node --version");
  assert.ok(summary.amended.includes(leaf?.id as string), "expected the changed leaf's id in summary.amended");

  const entry = doc.amendments.find((a) => a.node_path && a.reason.includes("Regenerated"));
  assert.ok(entry, "expected an amendment audit entry for the regenerated leaf");

  await fs.rm(changeDir, { recursive: true, force: true });
});

test("regenerateDod adds a newly introduced scenario and removes a deleted one", async () => {
  const changeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-regen-"));
  const { doc, summary } = await buildRegeneratedDoc(changeDir);

  const group = doc.roots.find((r) => r.title === "Regeneration");
  const descriptions = group?.children?.map((c) => c.description ?? "") ?? [];

  assert.ok(
    descriptions.some((d) => d.includes("newly-added scenario")),
    "expected the newly introduced scenario to appear as a leaf",
  );
  assert.ok(
    !descriptions.some((d) => d.includes("will-be-removed scenario")),
    "expected the deleted scenario's leaf to be gone",
  );
  assert.equal(summary.added.length, 1);
  assert.equal(summary.removed.length, 1);

  await fs.rm(changeDir, { recursive: true, force: true });
});

// A second spec pair for the branches the first pair never reaches: a new
// group, a draft-text edit, and a concrete<->draft kind switch.
const KINDS_V1_SPEC = [
  "### Requirement: Kinds",
  "",
  "#### Scenario: Draft note",
  "- **WHEN** the release ships",
  "- **THEN** someone reviews the release notes by hand",
  "",
  "#### Scenario: Switches kind",
  "- **WHEN** the switch has not happened yet",
  "- **THEN** `npm --version` exits zero for the switches-kind scenario",
  "",
].join("\n");

const KINDS_V2_SPEC = [
  "### Requirement: Kinds",
  "",
  "#### Scenario: Draft note",
  "- **WHEN** the release ships",
  "- **THEN** someone carefully reviews the updated release notes by hand",
  "",
  "#### Scenario: Switches kind",
  "- **WHEN** the switch has happened",
  "- **THEN** a human confirms the switch by hand",
  "",
  "### Requirement: Brand New Group",
  "",
  "#### Scenario: Fresh one",
  "- **WHEN** the group is new",
  "- **THEN** `npm --version` exits zero for the fresh-one scenario",
  "",
].join("\n");

test("regenerateDod creates a brand-new requirement group for a scenario under a heading that did not exist yet", async () => {
  const changeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-regen-kinds-"));
  const v1 = await instructionsFor(changeDir, KINDS_V1_SPEC);
  const report = await renderAndImportDod(v1);
  const dodId = idFrom(report);

  const v2 = await instructionsFor(changeDir, KINDS_V2_SPEC);
  const summary = await regenerateDod(dodId, v2);

  const doc = await store.load(dodId);
  assert.ok(doc, "expected the regenerated doc to still be tracked");
  if (!doc) throw new Error("unreachable");

  const newGroup = doc.roots.find((r) => r.title === "Brand New Group");
  assert.ok(newGroup, "expected a new 'Brand New Group' root to be created");
  assert.equal(newGroup?.refinement, "draft");
  const freshLeaf = newGroup?.children?.find((c) => c.description?.includes("fresh-one scenario"));
  assert.ok(freshLeaf, "expected the 'Fresh one' scenario to land in the new group");
  assert.ok(summary.added.includes(freshLeaf?.id as string), "expected the new leaf's id in summary.added");

  await fs.rm(changeDir, { recursive: true, force: true });
});

test("regenerateDod mutates a draft leaf's text in place when its scenario stays a draft", async () => {
  const changeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-regen-kinds-"));
  const v1 = await instructionsFor(changeDir, KINDS_V1_SPEC);
  const report = await renderAndImportDod(v1);
  const dodId = idFrom(report);

  const v2 = await instructionsFor(changeDir, KINDS_V2_SPEC);
  const summary = await regenerateDod(dodId, v2);

  const doc = await store.load(dodId);
  assert.ok(doc, "expected the regenerated doc to still be tracked");
  if (!doc) throw new Error("unreachable");

  const group = doc.roots.find((r) => r.title === "Kinds");
  const leaf = group?.children?.find((c) => c.intent?.includes("release notes"));
  assert.ok(leaf, "expected the 'Draft note' leaf to survive as a draft");
  assert.equal(leaf?.refinement, "draft");
  assert.equal(leaf?.intent, "MANUAL: someone carefully reviews the updated release notes by hand");
  assert.ok(summary.amended.includes(leaf?.id as string), "expected the mutated draft's id in summary.amended");

  await fs.rm(changeDir, { recursive: true, force: true });
});

test("regenerateDod replaces a leaf whose scenario switched from concrete to draft", async () => {
  const changeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-regen-kinds-"));
  const v1 = await instructionsFor(changeDir, KINDS_V1_SPEC);
  const report = await renderAndImportDod(v1);
  const dodId = idFrom(report);

  const before = await store.load(dodId);
  const beforeLeaf = before?.roots
    .find((r) => r.title === "Kinds")
    ?.children?.find((c) => c.description?.includes("switches-kind scenario"));
  assert.ok(beforeLeaf, "expected the 'Switches kind' leaf to start out concrete");
  assert.equal(beforeLeaf?.refinement, "concrete");

  const v2 = await instructionsFor(changeDir, KINDS_V2_SPEC);
  const summary = await regenerateDod(dodId, v2);

  const doc = await store.load(dodId);
  assert.ok(doc, "expected the regenerated doc to still be tracked");
  if (!doc) throw new Error("unreachable");

  const group = doc.roots.find((r) => r.title === "Kinds");
  const afterLeaf = group?.children?.find((c) => c.intent?.includes("human confirms the switch"));
  assert.ok(afterLeaf, "expected the 'Switches kind' leaf to now be a draft with the new text");
  assert.equal(afterLeaf?.refinement, "draft");
  assert.notEqual(afterLeaf?.id, beforeLeaf?.id, "expected replacement, not in-place mutation, across a kind switch");
  assert.ok(
    summary.removed.includes(beforeLeaf?.id as string),
    "expected the old concrete leaf's id in summary.removed",
  );
  assert.ok(summary.added.includes(afterLeaf?.id as string), "expected the new draft leaf's id in summary.added");

  await fs.rm(changeDir, { recursive: true, force: true });
});

test("regenerateDod keeps the tamper fingerprint honest: a following check reports tampered false", async () => {
  const changeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-regen-"));
  const { doc } = await buildRegeneratedDoc(changeDir);

  const result = await checkDocument(doc);
  assert.equal(result.tampered, undefined);

  await fs.rm(changeDir, { recursive: true, force: true });
});
