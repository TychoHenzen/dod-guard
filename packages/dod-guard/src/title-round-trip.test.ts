/**
 * A concrete leaf's title is its `#### Scenario:` heading, and the rendered
 * dod.md is the only path into canonical storage a generated DoD takes. So the
 * heading has to survive render -> parse, and a regeneration has to refresh it.
 * `dodTreeToSteps` copies `leaf.title` straight into a step title, which is
 * what a stale or substituted title would corrupt.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { writeMarkdown } from "./author.js";
import { handleDodAmend } from "./mcp/dod-amend.js";
import { renderAndImportDod } from "./openspec/import-dod.js";
import { regenerateDod } from "./openspec/regenerate-dod.js";
import type { OpenSpecInstructions } from "./openspec/types.js";
import { parseMarkdownFromString } from "./parser.js";
import * as store from "./store.js";
import type { DodDocument, TaskNode } from "./types.js";

const SCENARIO_TITLE = "Leaves convert in order";
const THEN_TEXT = "`npm --version` exits zero for the ordering scenario";

function leaf(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: "leaf-1",
    title: SCENARIO_TITLE,
    refinement: "concrete",
    command: "npm --version",
    predicate: { type: "exit_code", value: 0 },
    description: THEN_TEXT,
    last_status: "pending",
    ...overrides,
  };
}

function docWith(roots: TaskNode[], markdownPath: string): DodDocument {
  return {
    id: "doc-title-round-trip",
    title: "Title Round Trip",
    goal: "Keep a leaf's scenario heading.",
    date: "2026-08-12",
    cwd: "C:/repo",
    markdown_path: markdownPath,
    created_at: "2026-08-12T00:00:00.000Z",
    sections: { requirements: "- the leaf keeps its name" },
    roots,
    amendments: [],
  };
}

let workDir: string;
let storeDir: string;

beforeEach(async () => {
  workDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-title-"));
  // Isolate canonical storage the same way regenerate-dod.test.ts does.
  storeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-store-"));
  process.env.DOD_STORE_DIR = storeDir;
});

afterEach(async () => {
  delete process.env.DOD_STORE_DIR;
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.rm(storeDir, { recursive: true, force: true });
});

async function render(roots: TaskNode[]): Promise<string> {
  const markdownPath = join(workDir, "dod.md");
  await writeMarkdown(docWith(roots, markdownPath));
  return fs.readFile(markdownPath, "utf-8");
}

test("a rendered concrete leaf carries its title alongside the command and description", async () => {
  const md = await render([leaf()]);

  const line = md.split("\n").find((l) => l.includes("Proof:"));
  assert.ok(line, "expected a rendered proof line");
  assert.ok(line?.includes(`**${SCENARIO_TITLE}**`), `title missing from rendered line: ${line}`);
  assert.match(line as string, /Proof: `npm --version` -> /);
  assert.ok(line?.includes(THEN_TEXT), "the THEN text still renders as the description");
  assert.ok(line?.includes('<!--p:{"type":"exit_code","value":0}-->'), "predicate metadata still rides along");
});

test("parsing a rendered leaf yields the scenario heading as title and the THEN text as description", async () => {
  const md = await render([leaf()]);
  const parsed = parseMarkdownFromString(md);

  const parsedLeaf = parsed.roots[0];
  assert.equal(parsedLeaf.title, SCENARIO_TITLE);
  assert.equal(parsedLeaf.description, THEN_TEXT);
  assert.equal(parsedLeaf.refinement, "concrete");
  assert.equal(parsedLeaf.command, "npm --version");
});

test("a render-then-parse round trip preserves every leaf's title and description, nested or not", async () => {
  const group: TaskNode = {
    id: "group-1",
    title: "Requirement group",
    refinement: "draft",
    last_status: "draft",
    children: [
      leaf({
        id: "leaf-2",
        title: "Second scenario",
        description: "`node --version` exits zero",
        command: "node --version",
      }),
      leaf({
        id: "leaf-3",
        title: "Third scenario",
        description: "`npm --version` prints a version",
        predicate: { type: "output_matches", value: "\\d" },
      }),
    ],
  };

  const md = await render([leaf(), group]);
  const parsed = parseMarkdownFromString(md);

  assert.equal(parsed.roots[0].title, SCENARIO_TITLE);
  assert.equal(parsed.roots[0].description, THEN_TEXT);

  const children = parsed.roots[1].children ?? [];
  assert.deepEqual(
    children.map((c) => c.title),
    ["Second scenario", "Third scenario"],
  );
  assert.deepEqual(
    children.map((c) => c.description),
    ["`node --version` exits zero", "`npm --version` prints a version"],
  );
  assert.deepEqual(children[1].predicate, { type: "output_matches", value: "\\d" });
});

test("a leaf whose title only repeats its description round-trips unchanged", async () => {
  // Nothing is rendered twice for the human reader; the parser's fallback
  // restores the title from the description.
  const md = await render([leaf({ title: THEN_TEXT })]);
  assert.ok(!md.includes(`**${THEN_TEXT}** -`), "the repeated title is left out of the rendered line");

  const parsedLeaf = parseMarkdownFromString(md).roots[0];
  assert.equal(parsedLeaf.title, THEN_TEXT);
  assert.equal(parsedLeaf.description, THEN_TEXT);
});

// ── Regeneration ──────────────────────────────────────────────────────────

function specWith(thenText: string): string {
  return [
    "## ADDED Requirements",
    "",
    "### Requirement: Ordering",
    "",
    `#### Scenario: ${SCENARIO_TITLE}`,
    "- **WHEN** the converter runs",
    `- **THEN** ${thenText}`,
    "",
  ].join("\n");
}

async function instructionsFor(specContent: string): Promise<OpenSpecInstructions> {
  await fs.mkdir(join(workDir, "specs"), { recursive: true });
  await fs.writeFile(join(workDir, "specs", "delta.md"), specContent, "utf-8");
  return {
    changeName: "title-round-trip",
    artifactId: "dod",
    schemaName: "default",
    changeDir: workDir,
    planningHome: { kind: "local", root: workDir, changesDir: workDir, defaultSchema: "default" },
    outputPath: "dod.md",
    resolvedOutputPath: join(workDir, "dod.md"),
    existingOutputPaths: [],
    description: "title round trip",
    instruction: "",
    template: "",
    dependencies: [{ id: "specs", done: true, path: "specs/**/*.md", description: "" }],
    unlocks: [],
    root: { path: workDir, source: "test" },
  };
}

function idFrom(report: string): string {
  const match = report.match(/ID: ([^\s]+)/);
  assert.ok(match, `expected an "ID: ..." line in report, got: ${report}`);
  return match?.[1] as string;
}

function onlyLeaf(doc: DodDocument): TaskNode {
  const found = doc.roots.find((r) => r.title === "Ordering")?.children?.[0];
  assert.ok(found, "expected the Ordering group to hold one leaf");
  return found as TaskNode;
}

test("dod_amend applies a new title to the stored leaf", async () => {
  const markdownPath = join(workDir, "amend.md");
  const doc = docWith([leaf({ title: "Stale heading" })], markdownPath);
  await store.save(doc);

  const answer = await handleDodAmend({
    dod_id: doc.id,
    node_path: "0",
    new_title: SCENARIO_TITLE,
    reason: "the scenario was renamed",
  });
  assert.ok(!answer.startsWith("ERROR"), answer);

  const stored = await store.load(doc.id);
  assert.equal(stored?.roots[0].title, SCENARIO_TITLE);
  const entry = stored?.amendments.at(-1);
  assert.equal(entry?.old_value?.title, "Stale heading", "the audit entry records the title it replaced");
  assert.equal(entry?.new_value?.title, SCENARIO_TITLE);
});

test("regeneration refreshes a leaf title that no longer matches its scenario", async () => {
  const dodId = idFrom(await renderAndImportDod(await instructionsFor(specWith(THEN_TEXT))));

  // Stand in for a leaf whose title came from a scenario version that is gone
  // - a DoD generated before the title survived the round trip looks exactly
  // like this.
  const before = await store.load(dodId);
  assert.ok(before);
  onlyLeaf(before as DodDocument).title = THEN_TEXT;
  await store.save(before as DodDocument);

  const rewritten = "`npm --version` exits zero for the rewritten ordering scenario";
  await regenerateDod(dodId, await instructionsFor(specWith(rewritten)));

  const after = await store.load(dodId);
  assert.ok(after);
  const refreshed = onlyLeaf(after as DodDocument);
  assert.equal(refreshed.title, SCENARIO_TITLE, "the leaf title matches the current scenario heading");
  assert.equal(refreshed.description, rewritten, "and its description is the rewritten THEN text");
});
