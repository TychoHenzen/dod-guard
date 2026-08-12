import assert from "node:assert/strict";
import { promises as fsPromises, readFileSync } from "node:fs";
import * as os from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { countDraftNodes } from "../checker-tree.js";
import { convertInstructionsToDod } from "./convert.js";
import type { OpenSpecInstructions } from "./types.js";

// Captured from a real `openspec instructions dod --change
// adopt-openspec-for-dod-proofs --json` run - not hand-written, so the
// converter is proven against the CLI's actual shape, not a guess at it.
// tsc does not copy the JSON fixture into dist/openspec - reach it via src.
const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "openspec",
  "__fixtures__",
  "instructions.json",
);

// The captured `changeDir` is absolute to the machine that ran the CLI.
// Repoint it at this checkout so the test resolves real files anywhere. The
// change itself is archived now, and an archived change's spec deltas never
// move again - which is what makes it a stable fixture.
const ARCHIVED_CHANGE = join("archive", "2026-08-12-adopt-openspec-for-dod-proofs");

function loadFixture(): OpenSpecInstructions {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as OpenSpecInstructions;
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  raw.changeDir = join(repoRoot, "openspec", "changes", ARCHIVED_CHANGE);
  // Sentinel, unrelated to any real path, to prove pass-through rather
  // than a coincidental match against a real file.
  raw.resolvedOutputPath = "SENTINEL/dod.md";
  return raw;
}

const EXPECTED_TITLES = [
  "ASSUMPTION marker does not trip todo-marker",
  "DoD artifact in the schema",
  "DoD generated from spec deltas",
  "Generated DoD registers through dod_import",
  "Regenerated DoD preserves the tamper fingerprint",
  "Uncheckable scenario becomes a draft leaf",
  "Untraced leaf fails the check",
  "Untraced scenario is reported, not blocking",
  "adversarial review reads the spec",
  "assumption-marker rule counts without failing",
  "audit resolves each marker to one verdict",
  "briefing carries the Requirement field",
  "briefing states the assumption rule",
  "cheap-step mirrors step-by-step",
  "commit lands after each verified step",
  "convention is documented",
  "draft leaves map to manual_required steps",
  "finishing traces and archives",
  "handoff names opsx:apply as an executor",
  "interview keeps its question floors and adversarial review",
  "interview writes an OpenSpec change",
  "opsx:propose is a recognized plan producer",
  "questions carry a risk label and a per-round cap",
  "staleness check reads openspec status",
  "steps derive from the DoD as a schema artifact",
  "trace command exists",
  "trace is wired into the CI gate table",
  "unconfirmed answers become open questions",
].sort();

test("convertInstructionsToDod emits one group per requirement, each holding at least one leaf", async () => {
  const instructions = loadFixture();
  const result = await convertInstructionsToDod(instructions);

  assert.equal(result.roots.length, 28);

  const titles = result.roots.map((r) => r.title).sort();
  assert.deepEqual(titles, EXPECTED_TITLES);

  for (const root of result.roots) {
    assert.equal(root.refinement, "draft");
    assert.ok(root.children && root.children.length > 0, `expected ${root.title} to hold at least one leaf`);
  }
});

test("convertInstructionsToDod surfaces resolvedOutputPath unchanged", async () => {
  const instructions = loadFixture();
  const result = await convertInstructionsToDod(instructions);

  assert.equal(result.resolvedOutputPath, "SENTINEL/dod.md");
});

test("convertInstructionsToDod maps one scenario to one leaf carrying the THEN text", async () => {
  const instructions = loadFixture();
  const result = await convertInstructionsToDod(instructions);

  // "DoD generated from spec deltas" -> "One scenario becomes one leaf" is a
  // requirement with exactly one scenario in this repo's own spec delta.
  const group = result.roots.find((r) => r.title === "DoD generated from spec deltas");
  assert.ok(group, "expected the 'DoD generated from spec deltas' requirement group");
  const oneScenarioLeaf = group?.children?.find((c) => c.title === "One scenario becomes one leaf");
  assert.ok(oneScenarioLeaf, "expected a leaf for the 'One scenario becomes one leaf' scenario");
  assert.equal(oneScenarioLeaf?.refinement, "draft");
  assert.equal(
    oneScenarioLeaf?.intent,
    "MANUAL: the generated DoD contains one leaf under that requirement's heading, with the scenario's `THEN` line as the leaf intent",
  );
});

test("convertInstructionsToDod maps a requirement with two scenarios to two leaves under it", async () => {
  const instructions = loadFixture();
  const result = await convertInstructionsToDod(instructions);

  // The same requirement also carries "Leaves group under their requirement",
  // proving the mapping is one-to-one rather than "first scenario wins".
  const group = result.roots.find((r) => r.title === "DoD generated from spec deltas");
  assert.ok(group, "expected the 'DoD generated from spec deltas' requirement group");
  assert.equal(group?.children?.length, 2);
  const titles = group?.children?.map((c) => c.title);
  assert.deepEqual(titles, ["One scenario becomes one leaf", "Leaves group under their requirement"]);
  const secondLeaf = group?.children?.[1];
  assert.equal(secondLeaf?.intent, "MANUAL: the generated DoD groups both leaves under that one requirement heading");
});

test("convertInstructionsToDod joins several THEN bullets in one scenario with a space", async () => {
  const instructions = loadFixture();
  const result = await convertInstructionsToDod(instructions);

  // "Regenerated DoD preserves the tamper fingerprint" wraps its single
  // THEN bullet across two physical lines - that continuation line is not a
  // second `- **THEN**` bullet, but it exercises the same join rule a real
  // multi-THEN scenario would: every THEN segment, and every wrapped
  // continuation line within a segment, joins with a single space.
  const group = result.roots.find((r) => r.title === "Regenerated DoD preserves the tamper fingerprint");
  assert.ok(group, "expected the 'Regenerated DoD preserves the tamper fingerprint' requirement group");
  const leaf = group?.children?.[0];
  assert.equal(
    leaf?.intent,
    "MANUAL: regenerating and re-importing the DoD updates only the leaves tied to the changed scenario, and leaves the fingerprint on every untouched leaf intact",
  );
});

// Custom fixtures below (not the captured CLI output) - each pins one side
// of the checkable/uncheckable split against a scenario built for that
// purpose, isolated from the repo's own real spec deltas.
async function instructionsFor(specContent: string): Promise<OpenSpecInstructions> {
  const dir = await fsPromises.mkdtemp(join(os.tmpdir(), "dod-guard-openspec-"));
  await fsPromises.mkdir(join(dir, "specs"), { recursive: true });
  await fsPromises.writeFile(join(dir, "specs", "delta.md"), specContent, "utf-8");
  return {
    changeName: "test-change",
    artifactId: "dod",
    schemaName: "default",
    changeDir: dir,
    planningHome: { kind: "local", root: dir, changesDir: dir, defaultSchema: "default" },
    outputPath: "dod.md",
    resolvedOutputPath: join(dir, "dod.md"),
    existingOutputPaths: [],
    description: "",
    instruction: "",
    template: "",
    dependencies: [{ id: "specs", done: true, path: "specs/**/*.md", description: "" }],
    unlocks: [],
    root: { path: dir, source: "test" },
  };
}

test("convertInstructionsToDod maps a scenario no command can check to a draft leaf with a MANUAL: intent", async () => {
  const instructions = await instructionsFor(
    [
      "### Requirement: Prose quality",
      "",
      "#### Scenario: Reviewer checks tone",
      "- **WHEN** a reviewer reads the summary",
      "- **THEN** the summary reads clearly and stays on topic",
      "",
    ].join("\n"),
  );

  const result = await convertInstructionsToDod(instructions);

  const leaf = result.roots[0]?.children?.[0];
  assert.equal(leaf?.refinement, "draft");
  assert.ok(leaf?.intent?.startsWith("MANUAL:"), `expected intent to start with "MANUAL:", got ${leaf?.intent}`);
  assert.equal(countDraftNodes(result.roots), 1);
});

test("convertInstructionsToDod maps a checkable scenario to a concrete leaf, not a draft", async () => {
  const instructions = await instructionsFor(
    [
      "### Requirement: Build passes",
      "",
      "#### Scenario: Tests run clean",
      "- **WHEN** the suite runs",
      "- **THEN** `npm test` exits zero",
      "",
    ].join("\n"),
  );

  const result = await convertInstructionsToDod(instructions);

  const leaf = result.roots[0]?.children?.[0];
  assert.equal(leaf?.refinement, "concrete");
  assert.equal(leaf?.command, "npm test");
  assert.equal(countDraftNodes(result.roots), 0);
});
