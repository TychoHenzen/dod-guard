import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { convertInstructionsToDod } from "./openspec/convert.js";
import type { OpenSpecInstructions } from "./openspec/types.js";

// Captured from a real `openspec instructions dod --change
// adopt-openspec-for-dod-proofs --json` run - not hand-written, so the
// converter is proven against the CLI's actual shape, not a guess at it.
const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "openspec", "__fixtures__", "instructions.json");

// The captured `changeDir` is absolute to the machine that ran the CLI.
// Repoint it at this checkout so the test resolves real files anywhere.
function loadFixture(): OpenSpecInstructions {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as OpenSpecInstructions;
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  raw.changeDir = join(repoRoot, "openspec", "changes", "adopt-openspec-for-dod-proofs");
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

test("convertInstructionsToDod emits one group per requirement, no leaves", async () => {
  const instructions = loadFixture();
  const result = await convertInstructionsToDod(instructions);

  assert.equal(result.roots.length, 28);

  const titles = result.roots.map((r) => r.title).sort();
  assert.deepEqual(titles, EXPECTED_TITLES);

  for (const root of result.roots) {
    assert.equal(root.refinement, "draft");
    assert.deepEqual(root.children, []);
  }
});

test("convertInstructionsToDod surfaces resolvedOutputPath unchanged", async () => {
  const instructions = loadFixture();
  const result = await convertInstructionsToDod(instructions);

  assert.equal(result.resolvedOutputPath, "SENTINEL/dod.md");
});
