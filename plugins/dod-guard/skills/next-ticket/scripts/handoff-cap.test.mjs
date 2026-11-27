// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { CAPS } from "../../../lib/github-text.mjs";
import { HANDOFF_LIMITS, TRIAGE_LIMITS } from "../../../lib/handoff-limits.mjs";
import { buildTriageRecord } from "../../complete-pr/scripts/lib/triage-record.mjs";
import { commentText } from "./handoff-comment-text.mjs";

// Builds the largest `## Implementation handoff` comment that the limits in
// lib/handoff-limits.mjs let through, from the real renderers: every count at
// its limit, every id at its longest, every line one character short of being
// refused, every row still open so the remainder names them all, a carried
// checkpoint at its limit, and the largest conflict triage record.

const SHA_LENGTH = 40;
const HEAD = "f".repeat(SHA_LENGTH);
// The cap is a round number: the largest comment rounded up to this.
const CAP_STEP = 1000;

function id(prefix, at) {
  return `${prefix}${at}`.padEnd(HANDOFF_LIMITS.id, "x");
}

// A string of the length that makes render(fill) exactly limit characters long.
function filled(limit, render) {
  return "y".repeat(limit - render("").length);
}

function largestTaskLines() {
  return Array.from({ length: HANDOFF_LIMITS.tasks }, (_, at) => {
    const prefix = `- ${id("T", at)}: commit ${HEAD}. `;
    return `${prefix}${filled(HANDOFF_LIMITS.taskLine, (text) => `${prefix}${text}`)}`;
  });
}

function largestRows() {
  return Array.from({ length: HANDOFF_LIMITS.rows }, (_, at) => {
    const row = (observed) => ({ id: id("R", at), contract: id("AC-", at), status: "pending", observed });
    return row(filled(HANDOFF_LIMITS.rowLine, (text) => JSON.stringify(row(text))));
  });
}

function largestCheckpoint() {
  const heading = "## Preflight checkpoint\n\n";
  return `${heading}${filled(HANDOFF_LIMITS.checkpoint - 1, (text) => `${heading}${text}`)}\n`;
}

function many(count, make) {
  return Array.from({ length: count }, (_, at) => make(at));
}

function largestTriage() {
  const { line } = TRIAGE_LIMITS;
  const path = (at) => `${at}`.padEnd(TRIAGE_LIMITS.path, "p");
  const conflictLine = (at, questions) => `- \`${path(at)}\` (source): take-branch, basis B1, questions ${questions}`;
  const stop = { stop: "unresolvable_paths" };
  return buildTriageRecord({
    answers: many(TRIAGE_LIMITS.answers, (at) => ({
      citation: "a:1",
      fact: filled(line, (text) => `- Q${at}: ${text} (a:1)`),
      id: `Q${at}`,
    })),
    bases: many(TRIAGE_LIMITS.bases, (at) => ({ id: `B${at}`, text: filled(line, (text) => `- B${at}: ${text}`) })),
    conflicts: many(TRIAGE_LIMITS.conflicts, (at) => ({ class: "source", code: "UU", path: path(at) })),
    decisions: many(TRIAGE_LIMITS.conflicts, (at) => ({
      basis: "B1",
      decision: "take-branch",
      path: path(at),
      questionIds: [filled(line, (text) => conflictLine(at, text))],
    })),
    mergeSha: HEAD,
    recordedBase: HEAD,
    stop: {
      ...stop,
      decisionNeeded: filled(line, (text) => `- Decision needed: ${text}`),
      reason: filled(line, (text) => `- Stop: ${stop.stop}: ${text}`),
    },
    trustedHead: HEAD,
    verification: many(TRIAGE_LIMITS.verification, (at) => ({
      name: `c${at}`,
      result: filled(line, (text) => `- c${at}: ${text}`),
    })),
  });
}

test("builds the largest triage record the limits allow, with every varying line at its limit", () => {
  const triage = largestTriage();
  assert.equal(triage.problems, undefined, JSON.stringify(triage.problems));
  const full = triage.text.split("\n").filter((text) => text.length === TRIAGE_LIMITS.line);
  const varying =
    TRIAGE_LIMITS.conflicts + TRIAGE_LIMITS.bases + TRIAGE_LIMITS.answers + TRIAGE_LIMITS.verification + 2;
  assert.equal(full.length, varying);
});

test("the largest handoff comment the limits allow fits the handoff cap", () => {
  const builder = commentText(largestTaskLines(), largestRows(), HEAD);
  const checkpoint = largestCheckpoint();
  assert.equal(checkpoint.length, HANDOFF_LIMITS.checkpoint);
  // handoff-comment.mjs appends the carried checkpoint after a blank line, and
  // complete-pr appends the triage record the same way.
  const largest = `${builder}\n${checkpoint}\n${largestTriage().text}`;
  assert.ok(
    largest.length <= CAPS.handoff,
    `the largest handoff is ${largest.length} characters, over the ${CAPS.handoff} cap`,
  );
  // The cap is the largest comment rounded up to the next thousand, so a limit
  // that grows without the cap fails here, and so does a cap left far above it.
  assert.equal(CAPS.handoff, Math.ceil(largest.length / CAP_STEP) * CAP_STEP);
});
