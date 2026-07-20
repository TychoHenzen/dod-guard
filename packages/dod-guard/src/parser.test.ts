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

// ── Metadata-parsed concrete proof (round-trip from author.ts) ──────────

test("parses a single concrete proof leaf from author.ts metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → tests pass with exit 0 <!--p:{"type":"exit_code","value":0}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots.length, 1, "should have one root");
  assert.equal(parsed.roots[0].refinement, "concrete", "should be concrete");
  assert.equal(parsed.roots[0].command, "npm test", "should extract command");
  assert.equal(parsed.roots[0].description, "tests pass with exit 0", "should extract description");
  assert.equal(parsed.roots[0].last_status, "pending", "unchecked proof should be pending");
  assert.equal(parsed.roots[0].predicate?.type, "exit_code", "predicate type from metadata");
  assert.equal(parsed.roots[0].predicate?.value, 0, "predicate value from metadata");
});

test("parses a passed concrete proof (checkmark) from author.ts metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [x] Proof: \`exit 0\` → all checks pass <!--p:{"type":"exit_code","value":0}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].last_status, "pass", "checked proof should be pass");
  assert.equal(parsed.roots[0].refinement, "concrete", "should be concrete");
});

// ── Hand-written markdown → draft fallback ──────────────────────────────

test("hand-written proof without metadata becomes draft", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`node app.js\` → exit 1 on error
`;
  const parsed = p(md);
  assert.equal(parsed.roots.length, 1, "should have one root");
  assert.equal(parsed.roots[0].refinement, "draft", "no metadata → draft");
  assert.equal(parsed.roots[0].intent, "exit 1 on error", "description becomes intent");
  assert.equal(parsed.roots[0].last_status, "draft", "status is draft");
});

test("hand-written TDD proof without metadata becomes draft", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof (TDD 🟢 GREEN): \`pytest\` → red-before-green verified
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].refinement, "draft", "TDD without metadata → draft");
  assert.equal(parsed.roots[0].intent, "red-before-green verified", "description becomes intent");
});

test("hand-written manual proof without metadata becomes draft", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: Manual — human must verify deployment
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].refinement, "draft", "manual without metadata → draft");
  assert.equal(parsed.roots[0].intent, "human must verify deployment", "description becomes intent");
});

test("hand-written skipped proof without metadata becomes draft", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [~] Proof: \`manual\` → Manual — human must verify
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].refinement, "draft", "skipped without metadata → draft");
  assert.equal(parsed.roots[0].last_status, "draft", "status is draft");
});

// ── Author.ts round-trip: basic predicates ─────────────────────────────

test("round-trips exit_code predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`node app.js\` → exit 1 on error <!--p:{"type":"exit_code","value":1}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "exit_code");
  assert.equal(parsed.roots[0].predicate?.value, 1);
});

test("round-trips output_contains predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → must contain "PASS" <!--p:{"type":"output_contains","value":"PASS"}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "output_contains");
  assert.equal(parsed.roots[0].predicate?.value, "PASS");
});

test("round-trips output_not_contains predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → must not contain "FAIL" <!--p:{"type":"output_not_contains","value":"FAIL"}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "output_not_contains");
  assert.equal(parsed.roots[0].predicate?.value, "FAIL");
});

test("round-trips output_matches predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm run check\` → matches pattern <!--p:{"type":"output_matches","value":"\\\\d+ tests passed"}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "output_matches");
  assert.equal(parsed.roots[0].predicate?.value, "\\d+ tests passed");
});

test("round-trips output_not_matches predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm run lint\` → no ERROR <!--p:{"type":"output_not_matches","value":"ERROR"}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "output_not_matches");
  assert.equal(parsed.roots[0].predicate?.value, "ERROR");
});

test("round-trips exit_code_not predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`node app.js\` → must not exit 1 <!--p:{"type":"exit_code_not","value":"1"}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "exit_code_not");
  assert.equal(parsed.roots[0].predicate?.value, "1");
});

// ── Author.ts round-trip: TDD and manual predicates ───────────────────

test("round-trips TDD predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [x] Proof (TDD 🟢 GREEN): \`pytest\` → red-before-green verified <!--p:{"type":"tdd","value":0}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "tdd");
  assert.equal(parsed.roots[0].refinement, "concrete");
  assert.equal(parsed.roots[0].last_status, "pass");
});

test("round-trips manual predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: Manual — human verify <!--p:{"type":"manual"}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "manual");
  assert.equal(parsed.roots[0].refinement, "concrete");
  assert.equal(parsed.roots[0].command, "manual");
});

// ── Author.ts round-trip: special predicates ──────────────────────────

test("round-trips mutation predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`cargo mutants\` → mutation testing <!--p:{"type":"mutation","value":0}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "mutation");
  assert.equal(parsed.roots[0].refinement, "concrete");
});

test("round-trips regression predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm run bench\` → regression check <!--p:{"type":"regression","value":0}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "regression");
});

test("round-trips assertions predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm test\` → at least 5 assertions <!--p:{"type":"assertions","value":5}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "assertions");
  assert.equal(parsed.roots[0].predicate?.value, 5);
});

test("round-trips streamline predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`grep -r oldFn src/\` → no old code <!--p:{"type":"streamline","value":0}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "streamline");
});

test("round-trips observability predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`node check-logs.js\` → log coverage <!--p:{"type":"observability","value":0}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "observability");
});

test("round-trips brevity predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`node analyze.js\` → code quality <!--p:{"type":"brevity","value":0}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "brevity");
});

test("round-trips review predicate from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`code review\` → peer must approve <!--p:{"type":"review"}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "review");
});

test("round-trips brevity with complex predicate options from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npx biome check\` → code quality static analysis <!--p:{"type":"brevity","value":0,"max_line_length":100,"max_function_lines":20,"max_file_lines":200,"max_complexity":4,"require_guard_clauses":false,"suggest_guard_clauses":false}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "brevity");
  assert.equal(parsed.roots[0].predicate?.max_line_length, 100);
  assert.equal(parsed.roots[0].predicate?.max_function_lines, 20);
  assert.equal(parsed.roots[0].predicate?.max_file_lines, 200);
  assert.equal(parsed.roots[0].predicate?.max_complexity, 4);
  assert.equal(parsed.roots[0].predicate?.require_guard_clauses, false);
  assert.equal(parsed.roots[0].predicate?.suggest_guard_clauses, false);
});

test("round-trips regression with optional fields from metadata", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [ ] Proof: \`npm run bench\` → perf regression <!--p:{"type":"regression","value":0,"lower_is_better":false,"extract":"score: (\\\\d+)"}-->
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].predicate?.type, "regression");
  assert.equal(parsed.roots[0].predicate?.lower_is_better, false);
  assert.equal(parsed.roots[0].predicate?.extract, "score: (\\d+)");
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

test("parses nested task groups with leaves (draft fallback)", () => {
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
  assert.equal(backend.children[0].refinement, "draft", "no metadata → draft");
  assert.equal(backend.children[0].intent, "backend tests pass", "description becomes intent");

  const frontend = root.children[1];
  assert.ok(frontend, "Frontend should exist");
  assert.equal(frontend.title, "Frontend", "second group should be Frontend");
  assert.ok(frontend.children, "Frontend should have children");
  assert.equal(frontend.children.length, 1, "Frontend should have 1 leaf");
});

test("parses 3-level deep nesting (draft fallback)", () => {
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
  assert.equal(leaf.refinement, "draft", "no metadata → draft");
  assert.equal(leaf.intent, "jwt tests pass", "description becomes intent");
});

test("parses multiple root-level task groups (draft fallback)", () => {
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
  assert.equal(buildChildren[0].refinement, "draft", "no metadata → draft");
  assert.equal(buildChildren[0].intent, "type check passes", "description becomes intent");
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

test("skips non-DoD sections before DoD heading (draft fallback)", () => {
  const md = `# Test
**Goal:** test

Some text here.

## Definition of Done

- [ ] Proof: \`exit 0\` → should pass
`;
  const parsed = p(md);
  assert.equal(parsed.roots.length, 1, "should find proof after DoD heading");
  assert.equal(parsed.roots[0].refinement, "draft", "no metadata → draft");
  assert.equal(parsed.roots[0].intent, "should pass", "description becomes intent");
});

test("TDD proof without metadata becomes draft", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [x] Proof (TDD GREEN): \`pytest\` → red-before-green verified
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].refinement, "draft", "TDD without metadata → draft");
  assert.equal(parsed.roots[0].intent, "red-before-green verified", "description becomes intent");
  assert.equal(parsed.roots[0].last_status, "draft", "draft status");
});

test("proof without metadata becomes draft regardless of marker", () => {
  const md = `# Test
**Goal:** test

## Definition of Done

- [~] Proof: \`manual\` → Manual — human must verify
`;
  const parsed = p(md);
  assert.equal(parsed.roots[0].refinement, "draft", "skipped without metadata → draft");
  assert.equal(parsed.roots[0].last_status, "draft", "draft status");
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
    assert.equal(parsed.roots[0].refinement, "draft", "no metadata → draft");
    assert.equal(parsed.roots[0].intent, "disk parse works", "description becomes intent");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
