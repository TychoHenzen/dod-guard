import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, updateDocFromCheckResult } from "./author.js";
import type { DodDocument, CheckResult } from "./types.js";

function concNode(id: string, title: string, command: string, desc: string): any {
  return { id, title, refinement: "concrete", command, predicate: { type: "exit_code", value: 0 }, description: desc, last_status: "pending" };
}

function makeDoc(): DodDocument {
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
  };
}

test("renderMarkdown wraps Claude agent guidance in <claude_instructions>", () => {
  const md = renderMarkdown(makeDoc());
  assert.match(md, /<claude_instructions>/);
  assert.match(md, /<\/claude_instructions>/);
  assert.match(md, /<claude_instructions>[\s\S]*dod_check[\s\S]*<\/claude_instructions>/);
});

test("renderMarkdown wraps spec sections in semantic XML tags", () => {
  const md = renderMarkdown(makeDoc());
  for (const tag of ["decisions", "current_state", "requirements", "research_notes", "open_questions", "open_risks"]) {
    assert.match(md, new RegExp(`<${tag}>`));
    assert.match(md, new RegExp(`</${tag}>`));
  }
  assert.match(md, /<requirements>[\s\S]*Reject malformed[\s\S]*<\/requirements>/);
});

test("renderMarkdown wraps tree in <definition_of_done>", () => {
  const md = renderMarkdown(makeDoc());
  assert.match(md, /<definition_of_done>[\s\S]*npm test -- email[\s\S]*<\/definition_of_done>/);
});

test("renderMarkdown omits XML tags for absent optional sections", () => {
  const doc = makeDoc();
  doc.sections = { requirements: "Only requirements here." };
  const md = renderMarkdown(doc);
  assert.doesNotMatch(md, /<research_notes>/);
  assert.doesNotMatch(md, /<decisions>/);
  assert.match(md, /<requirements>/);
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

  assert.equal(doc.roots[0].last_status, "pass");
  assert.equal(doc.last_check?.overall, "pass", "prior full PASS must not be clobbered");
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
  assert.equal(doc.last_check?.overall, "incomplete");
});

test("renderMarkdown preserves goal, anti-cheat note, and proof commands", () => {
  const md = renderMarkdown(makeDoc());
  assert.match(md, /Validate email addresses on signup/);
  assert.match(md, /Anti-cheat/);
  assert.match(md, /npm test -- email/);
});
