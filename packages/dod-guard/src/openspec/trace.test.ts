import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { renderAndImportDod } from "./import-dod.js";
import { classifyOutcome, formatTraceReport, traceChange } from "./trace.js";
import type { OpenSpecInstructions } from "./types.js";

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

async function instructionsFor(specContent: string): Promise<OpenSpecInstructions> {
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

const ONE_REQUIREMENT_SPEC = [
  "### Requirement: Build passes",
  "",
  "#### Scenario: Tests run clean",
  "- **WHEN** the suite runs",
  "- **THEN** `npm --version` exits zero",
  "",
].join("\n");

test("traceChange reports hasDod: false when no DoD is registered for the change yet", async () => {
  const instructions = await instructionsFor(ONE_REQUIREMENT_SPEC);

  const report = await traceChange("test-change", instructions);

  assert.equal(report.hasDod, false);
  assert.equal(classifyOutcome(report), "no-dod");
});

test("traceChange finds no untraced leaves or scenarios right after a fresh import", async () => {
  const instructions = await instructionsFor(ONE_REQUIREMENT_SPEC);
  await renderAndImportDod(instructions);

  const report = await traceChange("test-change", instructions);

  assert.equal(report.hasDod, true);
  assert.deepEqual(report.untracedLeaves, []);
  assert.deepEqual(report.untracedScenarios, []);
  assert.equal(classifyOutcome(report), "ok");
});

test("traceChange names an untraced leaf that the scenario map has no entry for", async () => {
  const instructions = await instructionsFor(ONE_REQUIREMENT_SPEC);
  await renderAndImportDod(instructions);

  // Drop the sidecar to simulate a leaf that was never recorded (e.g. added
  // by hand via dod_add_node, outside the converter/regenerate flow).
  await fs.rm(`${instructions.resolvedOutputPath}.scenario-map.json`);

  const report = await traceChange("test-change", instructions);

  // `parser.ts` reconstructs a leaf's `title` from the rendered
  // description rather than the original scenario heading (see
  // scenario-identity.ts), so only the group prefix and count are stable
  // here - the sidecar, not this string, is the source of truth for identity.
  assert.equal(report.hasDod, true);
  assert.equal(report.untracedLeaves.length, 1);
  assert.match(report.untracedLeaves[0], /^Build passes > /);
  assert.equal(classifyOutcome(report), "blocked");
});

test("traceChange names an untraced scenario without treating it as blocking", async () => {
  const instructions = await instructionsFor(ONE_REQUIREMENT_SPEC);
  await renderAndImportDod(instructions);

  // The spec grows a second scenario after import, before regenerateDod runs.
  await fs.writeFile(
    join(changeDir, "specs", "delta.md"),
    `${ONE_REQUIREMENT_SPEC}\n#### Scenario: New behavior\n- **WHEN** something new happens\n- **THEN** it works\n`,
    "utf-8",
  );

  const report = await traceChange("test-change", instructions);

  assert.equal(report.hasDod, true);
  assert.deepEqual(report.untracedLeaves, []);
  assert.deepEqual(report.untracedScenarios, ["Build passes > New behavior"]);
  assert.equal(classifyOutcome(report), "ok");
  assert.match(formatTraceReport(report), /New behavior/);
});

test("formatTraceReport explains the no-dod case by change id", () => {
  const text = formatTraceReport({ changeId: "my-change", hasDod: false, untracedLeaves: [], untracedScenarios: [] });
  assert.match(text, /my-change/);
});
