import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, updateDocFromCheckResult } from "./author.js";
import type { DodDocument, CheckResult } from "./types.js";

function makeDoc(): DodDocument {
  return {
    id: "dod_test123",
    title: "Email Validation",
    goal: "Validate email addresses on signup",
    date: "2026-06-26",
    cwd: "/home/project",
    markdown_path: "/home/project/docs/plans/2026-06-26-email.md",
    created_at: "2026-06-26T10:00:00Z",
    locked: true,
    sections: {
      decisions: "Use RFC 5322 subset.",
      current_state: "No validation currently.",
      requirements: "Reject malformed addresses with a 400.",
      research_notes: "Found `validate()` in src/auth.ts.",
      open_questions: "Should we allow plus-addressing?",
      open_risks: "Regex catastrophic backtracking.",
    },
    steps: [
      {
        id: "s1",
        title: "Add validation function",
        proofs: [
          {
            id: "p1",
            command: "npm test -- email",
            predicate: { type: "exit_code", value: 0 },
            description: "exit 0, tests pass",
            last_status: "pending",
          },
        ],
      },
    ],
    amendments: [],
  };
}

test("renderMarkdown wraps the Claude agent guidance in <claude_instructions>", () => {
  const md = renderMarkdown(makeDoc());
  assert.match(md, /<claude_instructions>/);
  assert.match(md, /<\/claude_instructions>/);
  // Guidance content survives inside the tag
  assert.match(md, /<claude_instructions>[\s\S]*dod_check[\s\S]*<\/claude_instructions>/);
});

test("renderMarkdown wraps each spec section in a semantic XML tag", () => {
  const md = renderMarkdown(makeDoc());
  for (const tag of [
    "decisions",
    "current_state",
    "requirements",
    "research_notes",
    "open_questions",
    "open_risks",
  ]) {
    assert.match(md, new RegExp(`<${tag}>`), `missing open <${tag}>`);
    assert.match(md, new RegExp(`</${tag}>`), `missing close </${tag}>`);
  }
  // Section body is enclosed by the tag
  assert.match(md, /<requirements>[\s\S]*Reject malformed[\s\S]*<\/requirements>/);
});

test("renderMarkdown wraps the steps in <definition_of_done>", () => {
  const md = renderMarkdown(makeDoc());
  assert.match(md, /<definition_of_done>[\s\S]*Step 1: Add validation function[\s\S]*<\/definition_of_done>/);
});

test("renderMarkdown omits XML tags for absent optional sections", () => {
  const doc = makeDoc();
  doc.sections = { requirements: "Only requirements here." };
  const md = renderMarkdown(doc);
  assert.doesNotMatch(md, /<research_notes>/);
  assert.doesNotMatch(md, /<decisions>/);
  assert.match(md, /<requirements>/);
});

// WS-A: a scoped check must persist only the target step and must NOT overwrite
// the canonical last_check verdict (which only a full run produces).
test("updateDocFromCheckResult: scoped run persists target step but leaves last_check intact", () => {
  const doc = makeDoc();
  doc.last_check = { timestamp: "2026-06-26T09:00:00Z", overall: "pass", summary: "prior full PASS" };

  const scoped: CheckResult = {
    overall: "incomplete",
    scoped: true,
    ran_step_id: "s1",
    timestamp: "2026-06-26T11:00:00Z",
    summary: "SCOPED",
    proof_fingerprint: "abc",
    steps: [{ id: "s1", title: "Add validation function", status: "pass",
      proofs: [{ id: "p1", description: "exit 0, tests pass", status: "pass", command: "npm test -- email", output: "ok" }] }],
  };

  updateDocFromCheckResult(doc, scoped);

  assert.equal(doc.steps[0].proofs[0].last_status, "pass", "target step proof was persisted");
  assert.equal(doc.last_check?.overall, "pass", "prior full PASS verdict must not be clobbered by a scoped run");
  assert.equal(doc.last_check?.summary, "prior full PASS");
});

test("renderMarkdown preserves goal, anti-cheat note and proof commands", () => {
  const md = renderMarkdown(makeDoc());
  assert.match(md, /Validate email addresses on signup/);
  assert.match(md, /Anti-cheat/);
  assert.match(md, /npm test -- email/);
});
