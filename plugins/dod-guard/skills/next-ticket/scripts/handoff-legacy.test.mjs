// Handoffs posted before 2026-11-27 stay on GitHub in the older shape: task
// bullets that list files and evidence ids, and a pretty-printed JSON array of
// full matrix rows that each copy the planned fields and the head. The fixture
// is dod-guard#1115's real handoff. Every reader that reads a handoff back
// (closure, the superseded heading, resume) must read it and the new compact
// shape alike.
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: The test reads its fixture from disk.
import { readFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { test } from "node:test";
import { selectHandoff } from "../../../lib/handoff-comments.mjs";
import { joinPlannedRows, readHandoffMatrix } from "../../../lib/handoff-matrix.mjs";
import { pendingMatrixRows } from "../../complete-pr/scripts/lib/closure-records.mjs";
import { classify } from "./resume-state-classify.mjs";

const ME = "TychoHenzen";
const LEGACY = readFileSync(new URL("../../../lib/fixtures/legacy-handoff-1115.md", import.meta.url), "utf8");
// biome-ignore lint/security/noSecrets: A git commit SHA from the fixture, not a credential.
const LEGACY_HEAD = "61e56b6e21c0ec22da9527b2c8f627ec8b3ac36b";
// biome-ignore lint/security/noSecrets: A made-up git commit SHA, not a credential.
const COMPACT_HEAD = "0123456789abcdef0123456789abcdef01234567";
const LEGACY_IDS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11"];
const LEGACY_INAPPLICABLE = new Set(["R7", "R8", "R9"]);
const SUPERSEDED_LEGACY =
  /^## Superseded handoff \(head 61e56b6\)\n\nSuperseded by the handoff comment at head 0123456 \(comment 2\)/;
const COMPACT = [
  "## Implementation handoff",
  "",
  "- T1: commit 0123456. Tests pass.",
  "",
  "## Acceptance matrix",
  "",
  "```json",
  `{"headSha":"${COMPACT_HEAD}","rows":[`,
  '{"id":"R1","contract":"AC-1","status":"pass","observed":"seen"},',
  '{"id":"R2","contract":"AC-1","status":"fail","observed":"not seen"}',
  "]}",
  "```",
  "",
  "Remainder: R2",
  "",
].join("\n");

function comment(id, body, createdAt) {
  // biome-ignore lint/style/useNamingConvention: object keys mirror the GitHub REST field names.
  return { id, created_at: createdAt, user: { login: ME }, body };
}

function legacyStatus(id) {
  if (LEGACY_INAPPLICABLE.has(id)) {
    return `${id}:inapplicable`;
  }
  return `${id}:pass`;
}

test("the older handoff reads as eleven settled rows at its head, unjoined", () => {
  const read = readHandoffMatrix(LEGACY);
  assert.equal(read.error, undefined);
  assert.equal(read.compact, false);
  assert.equal(read.headSha, LEGACY_HEAD);
  assert.deepEqual(
    read.rows.map((row) => `${row.id}:${row.status}`),
    LEGACY_IDS.map(legacyStatus),
  );
  assert.ok(read.rows.every((row) => row.headSha === LEGACY_HEAD && typeof row.expected === "string"));
  assert.equal(joinPlannedRows(read, []).rows, read.rows);
});

test("closure reads the pending rows of both shapes", () => {
  assert.deepEqual(pendingMatrixRows(readHandoffMatrix(LEGACY).rows), []);
  assert.deepEqual(pendingMatrixRows(readHandoffMatrix(COMPACT).rows), ["R2"]);
});

test("the superseded heading names the head of both shapes", () => {
  const comments = [comment(1, LEGACY, "2026-11-01T00:00:00Z"), comment(2, COMPACT, "2026-11-27T00:00:00Z")];
  const selected = selectHandoff(comments, ME);
  assert.deepEqual(selected.keep, { id: 2 });
  assert.match(selected.superseded[0].body, SUPERSEDED_LEGACY);
});

test("resume finds the branch tip in both shapes", () => {
  const state = (body, tip) =>
    classify({
      comments: [comment(1, body, "2026-11-27T00:00:00Z")],
      login: ME,
      tip,
      tipDate: "2026-11-26T00:00:00Z",
      ahead: 1,
    }).state;
  assert.equal(state(LEGACY, LEGACY_HEAD), "live-handoff");
  assert.equal(state(COMPACT, COMPACT_HEAD), "live-handoff");
  assert.equal(state(COMPACT, LEGACY_HEAD), "resumable");
});
