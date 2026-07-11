import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseMarkdown, parseMarkdownFromString } from "./parser.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), "dod-parser-"));
}

// Parse from string — zero filesystem I/O, near-instant.
function p(md: string) {
  return parseMarkdownFromString(md);
}

// ── Basic document structure ──────────────────────────────────────────────

test("parses title, goal, date, cwd from markdown header", () => {
  const md = `# Email Validation — Requirements Spec

**Goal:** Validate email addresses on signup
**Date:** 2026-06-26
**Target:** \`/home/project\`
`;
  const parsed = p(md);
  assert.equal(parsed.title, "Email Validation", "should extract title");
  assert.equal(parsed.goal, "Validate email addresses on signup", "should extract goal");
  assert.equal(parsed.date, "2026-06-26", "should extract date");
  assert.equal(parsed.cwd, "/home/project", "should extract target path");
});

test("extracts cwd from 'All commands run from' line", () => {
  const md = "# Test\n\n**Goal:** g\n\nAll commands run from `/app/folder` unless noted.\n";
  const parsed = p(md);
  assert.equal(parsed.cwd, "/app/folder", "should extract cwd from commands-run-from line");
});

// ── Section parsing ───────────────────────────────────────────────────────

test("parses all section types", () => {
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
  const parsed = p(md);
  assert.ok(parsed.sections.requirements.includes("validate"), "should have requirements");
  assert.ok(parsed.sections.research_notes?.includes("Found"), "should have research_notes");
  assert.ok(parsed.sections.open_questions?.includes("Plus"), "should have open_questions");
  assert.ok(parsed.sections.open_risks?.includes("Regex"), "should have open_risks");
  assert.ok(parsed.sections.decisions?.includes("RFC"), "should have decisions");
  assert.ok(parsed.sections.current_state?.includes("No validation"), "should have current_state");
});

test("sections absent when not in markdown", () => {
  const md = "# Test\n\n**Goal:** test\n\n## Requirements\n\nOnly requirement.\n";
  const parsed = p(md);
  assert.equal(parsed.sections.requirements, "Only requirement.", "should have requirements");
  assert.equal(parsed.sections.research_notes, undefined, "research_notes should be absent");
  assert.equal(parsed.sections.decisions, undefined, "decisions should be absent");
});

// ── Single concrete proof ─────────────────────────────────────────────────

test("parses a single concrete proof leaf", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → tests pass with exit 0
`;
  const parsed = p(md);
  assert.equal(parsed.roots.length, 1, "should have one root");
  assert.equal(parsed.roots[0].refinement, "concrete", "should be concrete");
  assert.equal(parsed.roots[0].command, "npm test", "should extract command");
  assert.equal(parsed.roots[0].description, "tests pass with exit 0", "should extract description");
  assert.equal(parsed.roots[0].last_status, "pending", "unchecked proof should be pending");
});

test("parses a passed concrete proof (checkmark)", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [x] Proof: \`exit 0\` → all checks pass
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].last_status, "pass", "checked proof should be pass");
});

// ── Predicate inference ───────────────────────────────────────────────────

test("infers exit_code predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`node app.js\` → exit 1 on error
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "exit_code", "should infer exit_code");
  assert.equal((parsed.roots[0] as any).predicate.value, 1, "should extract exit code 1");
});

test("infers output_contains predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → must contain "PASS"
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "output_contains", "should infer output_contains");
  assert.equal((parsed.roots[0] as any).predicate.value, "PASS", "should extract quoted string");
});

test("infers output_not_contains predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → must not contain "FAIL"
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "output_not_contains", "should infer output_not_contains");
  assert.equal((parsed.roots[0] as any).predicate.value, "FAIL", "should extract quoted string");
});

test("infers TDD predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`pytest\` → TDD: tests must fail first then pass
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "tdd", "should infer tdd");
});

test("infers manual predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: Manual — human must verify deployment
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "manual", "should infer manual");
  assert.equal(parsed.roots[0].command, "manual", "command should be 'manual'");
});

test("infers output_matches predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm run check\` → output matches "\\d+ tests passed"
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "output_matches", "should infer output_matches");
  assert.equal((parsed.roots[0] as any).predicate.value, "\\d+ tests passed", "should extract regex pattern");
});

test("infers output_not_matches predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm run lint\` → must not match "ERROR"
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "output_not_matches", "should infer output_not_matches");
  assert.equal((parsed.roots[0] as any).predicate.value, "ERROR", "should extract forbidden pattern");
});

test("infers exit_code_not predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`node app.js\` → must not exit 1
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "exit_code_not", "should infer exit_code_not");
  assert.equal((parsed.roots[0] as any).predicate.value, 1, "should extract forbidden exit code");
});

test("infers review predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`code review\` → review — peer must approve changes
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "review", "should infer review");
  assert.equal(parsed.roots[0].command, "code review", "should extract review command");
});

test("infers mutation predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`cargo mutants\` → mutation testing with 0 survivors
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "mutation", "should infer mutation");
});

test("infers regression predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm run bench\` → regression baseline check
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "regression", "should infer regression");
});

test("infers assertions predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → at least 5 non-trivial assertions
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "assertions", "should infer assertions");
  assert.equal((parsed.roots[0] as any).predicate.value, 5, "should extract assertion count");
});

test("infers streamline predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`grep -r oldFn src/\` → streamline — no old code left
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "streamline", "should infer streamline");
});

test("infers observability predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`node check-logs.js\` → observability — log statements in all handlers
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "observability", "should infer observability");
});

test("infers brevity predicate from description", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`node analyze.js\` → brevity — code quality static analysis
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "brevity", "should infer brevity");
});

test("parses draft leaf nodes", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [~] **Draft**: Write unit tests for validation
`;
  const parsed = p(md);
  assert.equal(parsed.roots.length, 1, "should have one root");
  assert.equal(parsed.roots[0].refinement, "draft", "should be draft");
  assert.equal(parsed.roots[0].last_status, "draft", "status should be draft");
  assert.ok(parsed.roots[0].intent?.includes("unit tests"), "should capture intent");
});

// ── Hierarchical tree parsing ─────────────────────────────────────────────

test("parses nested task groups with leaves", () => {
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
  const parsed = p(md);
  assert.equal(parsed.roots.length, 1, "should have one root node");
  const root = parsed.roots[0];
  assert.ok(root.children, "root should have children");
  assert.equal(root.children.length, 2, "should have 2 task groups");

  const backend = root.children[0];
  assert.ok(backend, "Backend should exist");
  assert.equal(backend.title, "Backend", "first group should be Backend");
  assert.ok(backend.children, "Backend should have children");
  assert.equal(backend.children.length, 2, "Backend should have 2 leaves");
  assert.equal(backend.children[0].command, "npm test", "first leaf should be npm test");

  const frontend = root.children[1];
  assert.ok(frontend, "Frontend should exist");
  assert.equal(frontend.title, "Frontend", "second group should be Frontend");
  assert.ok(frontend.children, "Frontend should have children");
  assert.equal(frontend.children.length, 1, "Frontend should have 1 leaf");
});

test("parses 3-level deep nesting", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

### Auth Module [ ]

  **Token Service** [ ]

    **JWT Provider** [ ]

      - [ ] Proof: \`npm test -- jwt\` → jwt tests pass
`;
  const parsed = p(md);
  assert.equal(parsed.roots.length, 1, "should have root");
  const root = parsed.roots[0];
  assert.ok(root.children, "root should have children");
  const l1 = root.children[0];
  assert.ok(l1, "L1 should exist");
  assert.equal(l1.title, "Token Service", "L1 should be Token Service");
  assert.ok(l1.children, "L1 should have children");
  const l2 = l1.children[0];
  assert.ok(l2, "L2 should exist");
  assert.equal(l2.title, "JWT Provider", "L2 should be JWT Provider");
  assert.ok(l2.children, "L2 should have children");
  const leaf = l2.children[0];
  assert.ok(leaf, "leaf should exist");
  assert.equal(leaf.command, "npm test -- jwt", "leaf should have correct command");
});

test("parses multiple root-level task groups", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

### Build [ ]

  - [ ] Proof: \`tsc\` → type check passes

### Test [ ]

  - [ ] Proof: \`npm test\` → all tests pass
`;
  const parsed = p(md);
  assert.equal(parsed.roots.length, 2, "should have 2 root nodes");
  assert.equal(parsed.roots[0].title, "Build", "first root should be Build");
  assert.equal(parsed.roots[1].title, "Test", "second root should be Test");
  const buildChildren = parsed.roots[0].children;
  assert.ok(buildChildren, "Build should have children");
  assert.equal(buildChildren[0].command, "tsc", "Build should have tsc leaf");
});

// ── Edge cases ────────────────────────────────────────────────────────────

test("parses empty Definition of Done section", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

## Open risks

No risks.
`;
  const parsed = p(md);
  assert.equal(parsed.roots.length, 0, "should have zero roots");
  assert.ok(parsed.sections.open_risks?.includes("No risks"), "should still parse sections after DoD");
});

test("skips non-DoD sections before DoD heading", () => {
  const md = `# Test
**Goal:** test

Some text here.

## Definition of Done

- [ ] Proof: \`exit 0\` → should pass
`;
  const parsed = p(md);
  assert.equal(parsed.roots.length, 1, "should find proof after DoD heading");
  assert.equal(parsed.roots[0].command, "exit 0", "should parse command correctly");
});

test("TDD proof with state marker parses correctly", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [x] Proof (TDD GREEN): \`pytest\` → red-before-green verified
`;
  const parsed = p(md);
  assert.equal((parsed.roots[0] as any).predicate.type, "tdd", "should be TDD");
  assert.equal(parsed.roots[0].last_status, "pass", "should be pass from checkmark");
});

test("skipped proof with tilde marker", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [~] Proof: \`manual\` → Manual — human must verify
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].last_status, "skipped", "should be skipped from tilde");
});

// ── Error-path tests (use parseMarkdown for real file I/O) ────────────────

test("parseMarkdown rejects on nonexistent file", async () => {
  const badPath = join(tmpdir(), "does-not-exist-12345.md");
  await assert.rejects(
    () => parseMarkdown(badPath),
    {
      name: "Error",
      message: /ENOENT/,
    },
    "nonexistent file should reject with ENOENT",
  );
});

test("parseMarkdown parses real file on disk (end-to-end)", async () => {
  const dir = makeDir();
  try {
    const md = `# File Test

**Goal:** parse from disk

## Definition of Done

- [x] Proof: \`exit 0\` → disk parse works
`;
    const filePath = join(dir, "dod.md");
    writeFileSync(filePath, md, "utf-8");
    const parsed = await parseMarkdown(filePath);
    assert.equal(parsed.roots.length, 1, "should have one root from disk file");
    assert.equal(parsed.roots[0].last_status, "pass", "checkmark should be parsed as pass");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
