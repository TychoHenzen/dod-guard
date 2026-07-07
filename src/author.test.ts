import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, updateDocFromCheckResult, formatCheckResult } from "./author.js";
import type { DodDocument, CheckResult, TaskNode } from "./types.js";

function concNode(id: string, title: string, command: string, desc: string): TaskNode {
  return { id, title, refinement: "concrete", command, predicate: { type: "exit_code", value: 0 }, description: desc, last_status: "pending" };
}

function draftNode(id: string, title: string, intent: string): TaskNode {
  return { id, title, refinement: "draft", intent, last_status: "draft" };
}

function groupNode(id: string, title: string, children: TaskNode[]): TaskNode {
  return { id, title, refinement: "concrete", children, last_status: "draft" };
}

function makeDoc(overrides?: Partial<DodDocument>): DodDocument {
  return {
    id: "dod_test123",
    title: "Email Validation",
    goal: "Validate email addresses on signup",
    date: "2026-06-26",
    cwd: "/home/project",
    markdown_path: "/home/project/docs/plans/2026-06-26-email.md",
    created_at: "2026-06-26T10:00:00Z",
    sections: {
      decisions: "Use RFC 5322 subset.",
      current_state: "No validation currently.",
      requirements: "Reject malformed addresses with a 400.",
      research_notes: "Found `validate()` in src/auth.ts.",
      open_questions: "Should we allow plus-addressing?",
      open_risks: "Regex catastrophic backtracking.",
    },
    roots: [
      concNode("n1", "Add validation function", "npm test -- email", "exit 0, tests pass"),
    ],
    amendments: [],
    ...overrides,
  };
}

function makeCheckResult(overrides?: Partial<CheckResult>): CheckResult {
  return {
    overall: "pass",
    timestamp: "2026-06-26T11:00:00Z",
    summary: "all good",
    proof_fingerprint: "abc",
    draft_count: 0,
    manual_unverified: 0,
    amendment_warnings: [],
    blocked_by_manuals: false,
    leaves: [{ node_path: "0", id: "n1", title: "t", description: "d", status: "pass", command: "exit 0", output: "ok" }],
    ...overrides,
  };
}

test("renderMarkdown wraps Claude agent guidance in <claude_instructions>", () => {
  const md = renderMarkdown(makeDoc());
  assert.match(md, /<claude_instructions>/, "should have opening claude_instructions tag");
  assert.match(md, /<\/claude_instructions>/, "should have closing claude_instructions tag");
  assert.match(md, /<claude_instructions>[\s\S]*dod_check[\s\S]*<\/claude_instructions>/, "should mention dod_check inside claude_instructions");
});

test("renderMarkdown wraps spec sections in semantic XML tags", () => {
  const md = renderMarkdown(makeDoc());
  const tags = ["decisions", "current_state", "requirements", "research_notes", "open_questions", "open_risks"];
  for (const tag of tags) {
    assert.match(md, new RegExp(`<${tag}>`), `should have opening <${tag}> tag`);
    assert.match(md, new RegExp(`</${tag}>`), `should have closing </${tag}> tag`);
  }
  assert.match(md, /<requirements>[\s\S]*Reject malformed[\s\S]*<\/requirements>/, "requirements should contain the spec text");
});

test("renderMarkdown wraps tree in <definition_of_done>", () => {
  const md = renderMarkdown(makeDoc());
  assert.match(md, /<definition_of_done>[\s\S]*npm test -- email[\s\S]*<\/definition_of_done>/, "definition_of_done should contain proof command");
});

test("renderMarkdown omits XML tags for absent optional sections", () => {
  const doc = makeDoc();
  doc.sections = { requirements: "Only requirements here." };
  const md = renderMarkdown(doc);
  assert.doesNotMatch(md, /<research_notes>/, "should not have research_notes when absent");
  assert.doesNotMatch(md, /<decisions>/, "should not have decisions when absent");
  assert.match(md, /<requirements>/, "should have requirements when present");
});

test("updateDocFromCheckResult: scoped run persists target but leaves last_check intact", () => {
  const doc = makeDoc();
  doc.last_check = { timestamp: "2026-06-26T09:00:00Z", overall: "pass", summary: "prior full PASS" };

  const scoped: CheckResult = {
    overall: "incomplete",
    scoped: true,
    ran_node_path: "0",
    timestamp: "2026-06-26T11:00:00Z",
    summary: "SCOPED",
    proof_fingerprint: "abc",
    draft_count: 0,
    manual_unverified: 0,
    amendment_warnings: [],
    blocked_by_manuals: false,
    leaves: [{ node_path: "0", id: "n1", title: "Add validation", description: "tests pass", status: "pass", command: "npm test -- email", output: "ok" }],
  };

  updateDocFromCheckResult(doc, scoped);

  assert.equal(doc.roots[0].last_status, "pass", "root node last_status should be pass");
  assert.equal(doc.last_check?.overall, "pass", "prior full PASS must not be clobbered by scoped run");
  assert.equal(doc.last_check?.timestamp, "2026-06-26T09:00:00Z", "prior timestamp must be preserved");
  assert.equal(doc.last_check?.summary, "prior full PASS", "prior summary must be preserved");
});

test("updateDocFromCheckResult: full run persists overall", () => {
  const doc = makeDoc();

  const full: CheckResult = {
    overall: "incomplete",
    timestamp: "2026-06-26T11:00:00Z",
    summary: "1/1 proofs pass — manual proofs await dod_verify",
    proof_fingerprint: "abc",
    draft_count: 0,
    manual_unverified: 1,
    amendment_warnings: [],
    blocked_by_manuals: true,
    leaves: [{ node_path: "0", id: "n1", title: "Add validation", description: "tests pass", status: "skipped", command: "manual", output: "awaiting dod_verify" }],
  };

  updateDocFromCheckResult(doc, full);
  assert.equal(doc.last_check?.overall, "incomplete", "full run should persist incomplete overall");
});

test("renderMarkdown preserves goal, anti-cheat note, and proof commands", () => {
  const md = renderMarkdown(makeDoc());
  assert.match(md, /Validate email addresses on signup/, "should contain the goal text");
  assert.match(md, /Anti-cheat/, "should contain anti-cheat note");
  assert.match(md, /npm test -- email/, "should contain proof command");
});

// ── Edge cases ──────────────────────────────────────────────────────────

test("updateDocFromCheckResult: handles doc with no prior last_check", () => {
  const doc = makeDoc({ last_check: undefined } as Partial<DodDocument>);
  const res = makeCheckResult({ overall: "pass" });

  updateDocFromCheckResult(doc, res);
  assert.equal(doc.roots[0].last_status, "pass", "root node should be updated");
  assert.equal(doc.last_check?.overall, "pass", "should set last_check from first-ever check");
});

test("renderMarkdown handles nested TaskNode hierarchies", () => {
  const doc = makeDoc({
    roots: [
      groupNode("g1", "Group", [
        concNode("c1", "Child", "exit 0", "child proof"),
      ]),
    ],
  });
  const md = renderMarkdown(doc);
  assert.match(md, /Group/, "should render group title");
  assert.match(md, /child proof/, "should render child description");
  assert.match(md, /exit 0/, "should render child command");
});

test("renderMarkdown handles draft-only trees", () => {
  const doc = makeDoc({
    roots: [draftNode("d1", "Draft task", "intent: will validate later")],
  });
  const md = renderMarkdown(doc);
  assert.match(md, /intent: will validate later/, "should render intent text");
  assert.match(md, /Draft/, "should mark as Draft");
  assert.match(md, /\[~\]/, "should show draft marker [~]");
});

test("renderMarkdown handles zero roots", () => {
  const doc = makeDoc({ roots: [] });
  const md = renderMarkdown(doc);
  assert.ok(md.length > 0, "should produce valid markdown even with no roots");
  assert.match(md, /Definition of Done/, "should still have DoD header");
  assert.doesNotMatch(md, /\| \d+\./, "should not render proof table rows when no roots exist");
});

test("renderMarkdown handles XML-special characters in section content", () => {
  const doc = makeDoc({
    sections: {
      requirements: "Must handle <script> tags & \"quotes\" in input.",
    },
  });
  const md = renderMarkdown(doc);
  assert.match(md, /<requirements>/, "should have opening tag");
  assert.match(md, /<\/requirements>/, "should have closing tag");
  // Content is rendered as-is inside CDATA-like XML sections without escaping
  assert.match(md, /<script>/, "content should include special chars literally");
});

test("renderMarkdown handles unicode and empty strings in sections", () => {
  const doc = makeDoc({
    sections: {
      requirements: "Emoji test: 🚀 ✓ 日本語 한국어",
      open_questions: "",
      open_risks: "",
    },
  });
  const md = renderMarkdown(doc);
  assert.match(md, /🚀/, "should preserve emoji");
  assert.match(md, /日本語/, "should preserve CJK characters");
  // Empty-string sections are omitted from output entirely
  assert.doesNotMatch(md, /<open_questions>/, "empty open_questions should not render");
  assert.doesNotMatch(md, /<open_risks>/, "empty open_risks should not render");
});

// ── Deeper nesting ─────────────────────────────────────────────────────

test("renderMarkdown handles 3-level nested TaskNode hierarchies", () => {
  const doc = makeDoc({
    roots: [
      groupNode("g1", "Level 1", [
        groupNode("g2", "Level 2", [
          concNode("c1", "Leaf A", "exit 0", "leaf a proof"),
          concNode("c2", "Leaf B", "exit 1", "leaf b proof"),
        ]),
      ]),
    ],
  });
  const md = renderMarkdown(doc);
  assert.match(md, /Level 1/, "should render level-1 group");
  assert.match(md, /Level 2/, "should render level-2 group");
  assert.match(md, /leaf a proof/, "should render leaf A description");
  assert.match(md, /leaf b proof/, "should render leaf B description");
});

test("renderMarkdown handles multi-branch trees", () => {
  const doc = makeDoc({
    roots: [
      groupNode("g1", "Backend", [
        concNode("c1", "API", "exit 0", "api test"),
        concNode("c2", "DB", "exit 0", "db test"),
      ]),
      groupNode("g2", "Frontend", [
        concNode("c3", "UI", "exit 0", "ui test"),
      ]),
    ],
  });
  const md = renderMarkdown(doc);
  assert.match(md, /Backend/, "should render Backend branch");
  assert.match(md, /Frontend/, "should render Frontend branch");
  assert.match(md, /api test/, "should render api test");
  assert.match(md, /ui test/, "should render ui test");
});

// ── formatCheckResult ───────────────────────────────────────────────────

test("formatCheckResult: full pass renders PASS header", () => {
  const res = makeCheckResult({ overall: "pass" });
  const out = formatCheckResult(res);
  assert.match(out, /PASS/, "should render PASS");
  assert.doesNotMatch(out, /TAMPER/, "should not mention tamper");
  assert.doesNotMatch(out, /Scoped/, "should not mention scoped");
});

test("formatCheckResult: tamper-detected renders warning", () => {
  const res = makeCheckResult({ overall: "fail", tampered: true });
  const out = formatCheckResult(res);
  assert.match(out, /TAMPER DETECTED/, "should render tamper warning");
  assert.match(out, /FAIL/, "should show FAIL overall");
});

test("formatCheckResult: scoped run renders incomplete notice", () => {
  const res = makeCheckResult({
    overall: "incomplete",
    scoped: true,
    ran_node_path: "0.children.1",
  });
  const out = formatCheckResult(res);
  assert.match(out, /Scoped run/, "should mention scoped run");
  assert.match(out, /0\.children\.1/, "should show the ran node path");
  assert.match(out, /not a completion verdict/i, "should warn not a completion verdict");
});

test("formatCheckResult: mixed-status pass/fail/skipped counts", () => {
  const res = makeCheckResult({
    overall: "fail",
    leaves: [
      { node_path: "0", id: "n1", title: "t1", description: "d1", status: "pass", command: "exit 0", output: "ok" },
      { node_path: "1", id: "n2", title: "t2", description: "d2", status: "fail", command: "exit 1", output: "nope" },
      { node_path: "2", id: "n3", title: "t3", description: "d3", status: "skipped", command: "manual", output: "" },
    ],
  });
  const out = formatCheckResult(res);
  assert.match(out, /❌/, "should use fail icon for mixed-status");
  assert.match(out, /t1/, "should include passing leaf");
  assert.match(out, /t2/, "should include failing leaf");
});

test("formatCheckResult: draft nodes render with draft icon", () => {
  const res = makeCheckResult({
    overall: "incomplete",
    draft_count: 2,
    leaves: [
      { node_path: "0", id: "n1", title: "t1", description: "d1", status: "draft", command: "", output: "" },
    ],
  });
  const out = formatCheckResult(res);
  assert.match(out, /2 draft node/, "should mention draft count");
  assert.match(out, /📝/, "should use draft icon");
});

// ── Rendering: manual / TDD proofs ──────────────────────────────────────

test("renderMarkdown renders manual proof marker", () => {
  const doc = makeDoc({
    roots: [{
      id: "m1", title: "Manual Check", refinement: "concrete",
      command: "", predicate: { type: "manual" },
      description: "human must verify", last_status: "pending",
    } as TaskNode],
  });
  const md = renderMarkdown(doc);
  assert.match(md, /human must verify/, "should render manual proof description");
  assert.match(md, /manual/i, "should indicate manual type");
});

test("renderMarkdown renders TDD proof marker", () => {
  const doc = makeDoc({
    roots: [{
      id: "t1", title: "TDD Check", refinement: "concrete",
      command: "pytest", predicate: { type: "tdd" },
      description: "tests must fail then pass", last_status: "pending",
    } as TaskNode],
  });
  const md = renderMarkdown(doc);
  assert.match(md, /tests must fail then pass/, "should render TDD description");
});

// ── last_check / amendment rendering ────────────────────────────────────

test("renderMarkdown renders last_check header when present", () => {
  const doc = makeDoc();
  doc.last_check = { timestamp: "2026-06-26T11:00:00Z", overall: "pass", summary: "All 3 proofs passed" };
  const md = renderMarkdown(doc);
  assert.match(md, /Last check/, "should have last check header");
  assert.match(md, /PASS/, "should show PASS status");
});

test("renderMarkdown renders amendment log when amendments exist", () => {
  const doc = makeDoc();
  doc.amendments = [{
    timestamp: "2026-06-26T12:00:00Z",
    node_path: "0",
    action: "modified",
    reason: "Updated for new API",
    old_value: { command: "exit 0" },
    new_value: { command: "exit 1" },
  }];
  const md = renderMarkdown(doc);
  assert.match(md, /Amendment log/, "should have amendment log section");
  assert.match(md, /Updated for new API/, "should show amendment reason");
});

// ── updateDocFromCheckResult edge cases ─────────────────────────────────

test("updateDocFromCheckResult: handles undefined ran_node_path in scoped run", () => {
  const doc = makeDoc();
  const scoped: CheckResult = {
    overall: "incomplete",
    scoped: true,
    timestamp: "2026-06-26T11:00:00Z",
    summary: "SCOPED",
    proof_fingerprint: "abc",
    draft_count: 0,
    manual_unverified: 0,
    amendment_warnings: [],
    blocked_by_manuals: false,
    leaves: [{ node_path: "0", id: "n1", title: "Add validation", description: "tests pass", status: "pass", command: "npm test -- email", output: "ok" }],
  };
  updateDocFromCheckResult(doc, scoped);
  assert.equal(doc.roots[0].last_status, "pass", "should update root even without ran_node_path");
});

test("updateDocFromCheckResult: handles non-matching leaf paths gracefully", () => {
  const doc = makeDoc();
  const res: CheckResult = {
    overall: "pass",
    timestamp: "2026-06-26T11:00:00Z",
    summary: "ok",
    proof_fingerprint: "abc",
    draft_count: 0,
    manual_unverified: 0,
    amendment_warnings: [],
    blocked_by_manuals: false,
    leaves: [
      { node_path: "999", id: "n99", title: "unknown", description: "ghost leaf", status: "pass", command: "exit 0", output: "" },
    ],
  };
  updateDocFromCheckResult(doc, res);
  assert.equal(doc.last_check?.overall, "pass", "should set overall despite non-matching leaf");
});
