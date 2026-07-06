import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, updateDocFromCheckResult } from "./author.js";
import type { DodDocument, CheckResult, TaskNode } from "./types.js";

function concNode(id: string, title: string, command: string, desc: string): any {
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
