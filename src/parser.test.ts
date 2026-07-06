import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseMarkdown } from "./parser.js";

function makeDir(): string { return mkdtempSync(join(tmpdir(), "dod-parser-")); }

function writeMd(dir: string, content: string): string {
  const p = join(dir, "dod.md");
  writeFileSync(p, content, "utf-8");
  return p;
}

// ── Basic document structure ────────────────────────────────────────────

test("parses title, goal, date, cwd from markdown header", async () => {
  const dir = makeDir();
  try {
    const md = `# Email Validation — Requirements Spec

**Goal:** Validate email addresses on signup
**Date:** 2026-06-26
**Target:** \`/home/project\`
`;

    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.title, "Email Validation", "should extract title");
    assert.equal(parsed.goal, "Validate email addresses on signup", "should extract goal");
    assert.equal(parsed.date, "2026-06-26", "should extract date");
    assert.equal(parsed.cwd, "/home/project", "should extract target path");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extracts cwd from 'All commands run from' line", async () => {
  const dir = makeDir();
  try {
    const md = "# Test\n\n**Goal:** g\n\nAll commands run from `/app/folder` unless noted.\n";
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);
    assert.equal(parsed.cwd, "/app/folder", "should extract from commands-run-from line");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Section parsing ─────────────────────────────────────────────────────

test("parses all section types", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Requirements

Must validate input.

## Research Notes

Found \`validate()\`.

## Open Questions

Plus addressing?

## Open risks

Regex backtracking.

## Decisions (locked with user)

Use RFC 5322 subset.

## Current state

No validation exists.
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.ok(parsed.sections.requirements.includes("validate"), "should have requirements");
    assert.ok(parsed.sections.research_notes?.includes("Found"), "should have research_notes");
    assert.ok(parsed.sections.open_questions?.includes("Plus"), "should have open_questions");
    assert.ok(parsed.sections.open_risks?.includes("Regex"), "should have open_risks");
    assert.ok(parsed.sections.decisions?.includes("RFC"), "should have decisions");
    assert.ok(parsed.sections.current_state?.includes("No validation"), "should have current_state");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("sections absent when not in markdown", async () => {
  const dir = makeDir();
  try {
    const md = "# Test\n\n**Goal:** test\n\n## Requirements\n\nOnly requirement.\n";
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.sections.requirements, "Only requirement.", "should have requirements");
    assert.equal(parsed.sections.research_notes, undefined, "research_notes should be absent");
    assert.equal(parsed.sections.decisions, undefined, "decisions should be absent");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Single concrete proof ───────────────────────────────────────────────

test("parses a single concrete proof leaf", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → tests pass with exit 0
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.roots.length, 1, "should have one root");
    assert.equal(parsed.roots[0].refinement, "concrete", "should be concrete");
    assert.equal(parsed.roots[0].command, "npm test", "should extract command");
    assert.equal(parsed.roots[0].description, "tests pass with exit 0", "should extract description");
    assert.equal(parsed.roots[0].last_status, "pending", "unchecked proof should be pending");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("parses a passed concrete proof (checkmark)", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

- [x] Proof: \`exit 0\` → all checks pass
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.roots[0].last_status, "pass", "checked proof should be pass");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Predicate inference ─────────────────────────────────────────────────

test("infers exit_code predicate from description", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`node app.js\` → exit 1 on error
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal((parsed.roots[0] as any).predicate.type, "exit_code", "should infer exit_code");
    assert.equal((parsed.roots[0] as any).predicate.value, 1, "should extract exit code 1");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("infers output_contains predicate from description", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → must contain "PASS"
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal((parsed.roots[0] as any).predicate.type, "output_contains", "should infer output_contains");
    assert.equal((parsed.roots[0] as any).predicate.value, "PASS", "should extract quoted string");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("infers output_not_contains predicate from description", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → must not contain "FAIL"
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal((parsed.roots[0] as any).predicate.type, "output_not_contains", "should infer output_not_contains");
    assert.equal((parsed.roots[0] as any).predicate.value, "FAIL", "should extract quoted string");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("infers TDD predicate from description", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`pytest\` → TDD: tests must fail first then pass
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal((parsed.roots[0] as any).predicate.type, "tdd", "should infer tdd");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("infers manual predicate from description", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: Manual — human must verify deployment
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal((parsed.roots[0] as any).predicate.type, "manual", "should infer manual");
    assert.equal(parsed.roots[0].command, "manual", "command should be 'manual'");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Draft nodes ─────────────────────────────────────────────────────────

test("parses draft leaf nodes", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

- [~] **Draft**: Write unit tests for validation
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.roots.length, 1, "should have one root");
    assert.equal(parsed.roots[0].refinement, "draft", "should be draft");
    assert.equal(parsed.roots[0].last_status, "draft", "status should be draft");
    assert.ok(parsed.roots[0].intent?.includes("unit tests"), "should capture intent");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Hierarchical tree parsing ───────────────────────────────────────────

test("parses nested task groups with leaves", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

### Root Task [ ]

  **Backend** [ ]

    - [ ] Proof: \`npm test\` → backend tests pass
    - [ ] Proof: \`tsc\` → type check passes

  **Frontend** [ ]

    - [ ] Proof: \`npx jest\` → ui tests pass
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.roots.length, 1, "should have one root node");
    const root = parsed.roots[0];
    assert.ok(root.children, "root should have children");
    assert.equal(root.children!.length, 2, "should have 2 task groups");

    const backend = root.children![0];
    assert.equal(backend.title, "Backend", "first group should be Backend");
    assert.ok(backend.children, "Backend should have children");
    assert.equal(backend.children!.length, 2, "Backend should have 2 leaves");
    assert.equal(backend.children![0].command, "npm test", "first leaf should be npm test");

    const frontend = root.children![1];
    assert.equal(frontend.title, "Frontend", "second group should be Frontend");
    assert.equal(frontend.children!.length, 1, "Frontend should have 1 leaf");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("parses 3-level deep nesting", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

### Auth Module [ ]

  **Token Service** [ ]

    **JWT Provider** [ ]

      - [ ] Proof: \`npm test -- jwt\` → jwt tests pass
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.roots.length, 1, "should have root");
    const l1 = parsed.roots[0].children![0];
    assert.equal(l1.title, "Token Service", "L1 should be Token Service");
    const l2 = l1.children![0];
    assert.equal(l2.title, "JWT Provider", "L2 should be JWT Provider");
    const leaf = l2.children![0];
    assert.equal(leaf.command, "npm test -- jwt", "leaf should have correct command");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Multiple root nodes ─────────────────────────────────────────────────

test("parses multiple root-level task groups", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

### Build [ ]

  - [ ] Proof: \`tsc\` → type check passes

### Test [ ]

  - [ ] Proof: \`npm test\` → all tests pass
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.roots.length, 2, "should have 2 root nodes");
    assert.equal(parsed.roots[0].title, "Build", "first root should be Build");
    assert.equal(parsed.roots[1].title, "Test", "second root should be Test");
    assert.equal(parsed.roots[0].children![0].command, "tsc", "Build should have tsc leaf");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Edge cases ──────────────────────────────────────────────────────────

test("parses empty Definition of Done section", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

## Open risks

No risks.
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.roots.length, 0, "should have zero roots");
    assert.ok(parsed.sections.open_risks?.includes("No risks"), "should still parse sections after DoD");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("skips non-DoD sections before DoD heading", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

Some text here.

## Definition of Done

- [ ] Proof: \`exit 0\` → should pass
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.roots.length, 1, "should find proof after DoD heading");
    assert.equal(parsed.roots[0].command, "exit 0", "should parse command correctly");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("TDD proof with state marker parses correctly", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

- [x] Proof (TDD GREEN): \`pytest\` → red-before-green verified
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal((parsed.roots[0] as any).predicate.type, "tdd", "should be TDD");
    assert.equal(parsed.roots[0].last_status, "pass", "should be pass from checkmark");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("skipped proof with tilde marker", async () => {
  const dir = makeDir();
  try {
    const md = `# Test
**Goal:** test

## Definition of Done

- [~] Proof: \`manual\` → Manual — human must verify
`;
    const path = writeMd(dir, md);
    const parsed = await parseMarkdown(path);

    assert.equal(parsed.roots[0].last_status, "skipped", "should be skipped from tilde");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
