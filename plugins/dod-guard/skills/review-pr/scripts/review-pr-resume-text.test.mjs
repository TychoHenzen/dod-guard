import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const skill = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
const routing = readFileSync(new URL("../../../standards/model-routing.md", import.meta.url), "utf8");

function mentions(text, fragments) {
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `missing: ${fragment}`);
  }
}

// The owner thread keeps no state of its own, so the skill must say where each stage's state lives and how to
// pick it up again after a compaction or a restart.
test("the Investigate step cuts waves of at most 10 and lists the batches left with pending", () => {
  mentions(skill, [
    "in waves of at most 10",
    'review-findings.mjs" pending',
    "dispatch at most 10 of the `pending` ones",
  ]);
});

test("the scratch directory is named for the PR and the head, and a resumed owner reuses it", () => {
  mentions(skill, [
    "review-pr-<pr-number>-<first 12 characters of the head SHA>",
    "Resume from files, never from memory",
  ]);
});

test("the owner dispatches the judges in the foreground and saves each result to its own file", () => {
  mentions(skill, [
    "You, the owner, dispatch the four lens reviewers yourself",
    "(never in the background)",
    "judge-<lens>.json",
  ]);
});

test("a correction request is a fresh foreground dispatch and never resumes the earlier judge", () => {
  mentions(skill, ["as a fresh foreground dispatch of the same lens", "Never resume an earlier judge"]);
  assert.ok(!skill.includes("resume that same agent"), "the old resume-by-id rule is still there");
});

test("the skill points the owner at the Read, Grep and Glob tools", () => {
  mentions(skill, ["Read files with the Read tool, search with Grep and Glob"]);
});

test("the routing standard caps a message at 10 investigators and names the review-pr owner as dispatcher", () => {
  mentions(routing, [
    "at most 10 at a time",
    "`dod-guard:review-pr` owner dispatches its planner, investigators, judges and merge pass itself",
  ]);
});
