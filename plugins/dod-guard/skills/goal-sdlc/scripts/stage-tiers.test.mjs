// The stage-table surfaces of the owner's tier principle (issue 958): which
// cheap rows run on the skill-capable worker, the merge_conflict handoff, and
// the rerun rule. The table itself is pinned in goal-sdlc-contract.test.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const completePr = await readFile(new URL("../../complete-pr/SKILL.md", import.meta.url), "utf8");
const triage = await readFile(new URL("../../../standards/conflict-triage.md", import.meta.url), "utf8");

function assertPhrases(text, phrases) {
  for (const phrase of phrases) {
    assert.match(text, prose(phrase), phrase);
  }
}

test("goal-sdlc runs cheap skill-capable rows on the haiku stage worker", () => {
  assertPhrases(skill, [
    "A cheap row that needs a skill or a GitHub write",
    "(`/submit-draft-pr`, the `/review-pr` owner thread, `/complete-pr`, and",
    "`/add-backlog-idea`) runs on `dod-guard:stage-cheap-skill`.",
    "A rerun of any row, such as a refreshed handoff or a second `/complete-pr`, takes that row's tier.",
  ]);
});

test("a cheap-model complete-pr stops at merge_conflict and the triage rule has one owner", () => {
  assertPhrases(skill, [
    "A `/complete-pr` run on the cheap model stops at `merge_conflict`, and this thread",
    "then runs the conflict triage as its own stage, as `standards/conflict-triage.md` says.",
  ]);
  assertPhrases(completePr, [
    "A run on the cheap model does not triage.",
    "It stops at `merge_conflict`, reports the stop with the trusted head and the pull",
    "request number, and leaves the head unchanged.",
    "Its dispatcher then runs the triage, as `standards/conflict-triage.md` says.",
  ]);
  assertPhrases(triage, [
    "unless that run is on the cheap model:",
    "a cheap-model `/complete-pr` run stops at `merge_conflict` and reports the stop",
    "to its dispatcher, which runs the triage as its own stage.",
    "that thread is the `dod-guard:stage-standard`",
    "stage worker at the standard tier",
  ]);
});
