import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const skill = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
const routing = readFileSync(new URL("../../../standards/model-routing.md", import.meta.url), "utf8");

// Cuts from the heading line to the next heading of the same or a higher level, so a rule that moves to another
// section stops satisfying the assertion that names its section.
function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line === heading);
  assert.ok(start >= 0, `missing heading: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  const end = lines.findIndex(
    (line, index) => index > start && /^#+ /.test(line) && line.match(/^#+/)[0].length <= level,
  );
  return lines.slice(start, end < 0 ? lines.length : end).join("\n");
}

function mentions(text, fragments) {
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `missing: ${fragment}`);
  }
}

const ground = section(skill, "## Ground rules");
const investigate = section(skill, "### Investigate");
const judge = section(skill, "### Judge");

// The owner thread keeps no state of its own, so the skill must say where each stage's state lives and how to
// pick it up again after a compaction or a restart.
test("the Investigate step cuts waves of at most 10 and lists the batches left with pending", () => {
  mentions(investigate, [
    "in waves of at most 10",
    'review-findings.mjs" pending',
    "dispatch at most 10 of the `pending` ones",
  ]);
});

test("the Ground rules name the scratch directory for the PR and the head and the resume rule", () => {
  mentions(ground, [
    "review-pr-<pr-number>-<first 12 characters of the head SHA>",
    "Resume from files, never from memory",
  ]);
});

test("an existing scratch directory is resumed only when the brief names it, else the owner stops", () => {
  mentions(ground, [
    "When it already exists and your brief names it as the earlier owner's directory, resume from it",
    "When it already exists and your brief does not name it, stop and report its path",
    "never reuse it silently and never delete it",
  ]);
});

test("the owner dispatches the judges in the foreground and saves each result to its own file", () => {
  mentions(judge, [
    "You, the owner, dispatch the four lens reviewers yourself",
    "(never in the background)",
    "judge-<lens>.json",
  ]);
  // Only the ban and its reason may name the background, so any other mention is a rule that allows it.
  const leftover = judge.replaceAll("never in the background", "").replaceAll("a background reply", "");
  assert.ok(!leftover.includes("background"), "a Judge rule allows background dispatch");
});

test("a correction request is a fresh foreground dispatch and never resumes the earlier judge", () => {
  mentions(judge, ["as a fresh foreground dispatch of the same lens", "Never resume an earlier judge"]);
  assert.ok(!skill.includes("resume that same agent"), "the old resume-by-id rule is still there");
});

test("the Ground rules point the owner at the Read, Grep and Glob tools", () => {
  mentions(ground, ["Read files with the Read tool, search with Grep and Glob"]);
});

test("the routing standard caps a message at 10 investigators and names the review-pr owner as dispatcher", () => {
  mentions(section(routing, "## Plan, investigate, judge"), ["at most 10 at a time"]);
  mentions(section(routing, "## Who dispatches"), [
    "`dod-guard:review-pr` owner dispatches its planner, investigators, judges and merge pass itself",
  ]);
});
