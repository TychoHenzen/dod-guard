import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const standard = await readFile(new URL("../../../standards/project-workflow.md", import.meta.url), "utf8");

test("the standard defines both closure records once", () => {
  assert.equal(standard.match(/^## Closure records$/gm)?.length, 1);
  assert.match(standard, prose("`skills/complete-pr/scripts/lib/closure-records.mjs` parses and renders them"));
  assert.match(standard, prose("carries one `### supersedes` record", "under its `## Implementation notes`"));
  assert.match(standard, prose("The record lives only on the root; the original carries no reverse link."));
  assert.match(
    standard,
    prose("posts one comment with this heading on each linked closing issue and each finalized child"),
  );
  assert.match(standard, prose("`<!-- dod-guard-completion-evidence -->`"));
  for (const field of ["pullRequest", "mergeCommit", "trustedHeadSha", "requiredChecks", "pendingRows"]) {
    assert.ok(standard.includes(`\`${field}\``), field);
  }
  assert.match(standard, prose("A record with pending rows is `merged-pending`, not verified."));
  assert.match(standard, prose("Comment text alone is never trusted."));
  assert.match(
    standard,
    prose(
      "A comment is a completion or closure evidence record only when its body begins with the record heading,",
      "a blank line, and the marker line, followed by a line break or the end of the body;",
      "CRLF line endings are normalized to LF before this check.",
    ),
  );
  assert.match(
    standard,
    prose("A comment that quotes a marker anywhere else", "is never edited, counted, or parsed as a record."),
  );
  assert.match(standard, prose("is a hold with a named reason and no write"));
  assert.match(
    standard,
    prose(
      "is planned as a status repair,",
      "so a rerun finishes a stopped Done write without a second comment or close.",
    ),
  );
  assert.match(standard, prose("An issue that is already closed or Done without verified evidence"));
  assert.doesNotMatch(standard, prose("A record that is already closed or Done"));
});

test("complete-pr records completion and closes replaced issues after finalization", () => {
  const start = skill.indexOf("## Record completion and close replaced issues");
  const finalize = skill.indexOf("## Finalize the parent unit");
  assert.ok(start > finalize, "the closure step follows finalization");
  const section = skill.slice(start, skill.indexOf("## Result"));
  assert.match(section, prose("After the finalization readback shows the delivered issues Done"));
  assert.match(section, prose("closure.mjs record --repository=<owner/repository> --result=<helper-result.json>"));
  assert.match(section, prose("so a stopped run reruns it safely"));
  assert.match(section, prose("closure.mjs plan --snapshot=<file>"));
  assert.match(section, prose("closure.mjs apply --snapshot=<file>"));
  assert.match(section, prose("read, evidence comment, close with its `state_reason`, readback, and", "Project Done"));
  assert.match(
    section,
    prose(
      "a rerun completes the remaining steps without a second comment;",
      "it also sets Done on an issue it already closed whose Project status write stopped",
    ),
  );
  assert.match(section, prose("Closing keywords and the helper's", "linked-issue confirmation are unchanged."));
});

test("every caller builds the one closure snapshot the standard defines", async () => {
  const goalSdlc = await readFile(new URL("../../goal-sdlc/SKILL.md", import.meta.url), "utf8");
  const refineBacklog = await readFile(new URL("../../refine-backlog-item/SKILL.md", import.meta.url), "utf8");
  assert.match(standard, prose("closure snapshot"));
  for (const field of ["children", "body", "state_reason", "comments", "statusFieldId", "doneOptionId"]) {
    assert.ok(standard.includes("`" + field + "`"), field);
  }
  assert.match(standard, prose("sub-issue list missing"));
  for (const text of [skill, goalSdlc, refineBacklog]) {
    assert.match(text, prose("closure snapshot that `standards/project-workflow.md` defines"));
  }
  assert.doesNotMatch(skill, prose("in the shape that `closure.mjs`"));
  assert.match(skill, /^## Close delivered issues for goal-sdlc$/m);
  const start = skill.indexOf("## Close delivered issues for goal-sdlc");
  const section = skill.slice(start, skill.indexOf("## Result", start));
  assert.match(section, prose("closure.mjs apply --snapshot=<file>"));
  assert.match(section, prose("resolve no pull request"));
});

const BUILDS_SNAPSHOT = prose("closure.mjs snapshot --repository=");
const PLANS = prose("closure.mjs plan --snapshot=<file>");

// Both phrases must exist, and the first match of `first` must precede the first match of `second`.
function assertBefore(text, first, second, message) {
  const earlier = text.search(first);
  const later = text.search(second);
  if (earlier < 0 || later < 0) {
    throw new Error(`${message}: a phrase is missing`);
  }
  if (earlier >= later) {
    throw new Error(message);
  }
}

test("AC-08: every caller builds its closure snapshot with closure.mjs snapshot before it plans", async () => {
  const goalSdlc = await readFile(new URL("../../goal-sdlc/SKILL.md", import.meta.url), "utf8");
  const refineBacklog = await readFile(new URL("../../refine-backlog-item/SKILL.md", import.meta.url), "utf8");
  const sectionOf = (heading) => {
    const start = skill.indexOf(heading);
    if (start < 0) {
      throw new Error(`complete-pr has no "${heading}" section`);
    }
    return skill.slice(start, skill.indexOf("## Result", start));
  };
  assertBefore(
    goalSdlc,
    BUILDS_SNAPSHOT,
    prose("node closure.mjs plan --snapshot=<file>"),
    "goal-sdlc step 2 builds first",
  );
  assertBefore(
    sectionOf("## Record completion and close replaced issues"),
    BUILDS_SNAPSHOT,
    PLANS,
    "the completion record step builds before it plans",
  );
  assertBefore(
    sectionOf("## Close delivered issues for goal-sdlc"),
    BUILDS_SNAPSHOT,
    PLANS,
    "the delegated cleanup builds before it plans",
  );
  assertBefore(
    refineBacklog,
    BUILDS_SNAPSHOT,
    prose("closure.mjs plan --snapshot=<file> --hierarchy=<issue>"),
    "the hierarchy close builds before it plans",
  );
});

test("AC-08: the standard documents the repository-qualified snapshot shape", () => {
  const start = standard.indexOf("Each caller builds one closure snapshot");
  const end = standard.indexOf("never selects it.");
  assert.ok(start >= 0 && end > start, "the standard keeps the closure snapshot paragraphs");
  const shape = standard.slice(start, end);
  assert.match(shape, prose("closure.mjs snapshot --repository=<owner/name> --output=<file>"));
  for (const field of ["repository", "requiredChecks"]) {
    assert.ok(shape.includes(`\`${field}\``), field);
  }
  assert.match(shape, prose("`owner/name#number`"));
  assert.match(shape, prose("repository identity missing"));
  assert.match(shape, prose("is held with a reason that names it as `owner/name#N`"));
});

// The stop rule every snapshot place carries: a non-zero exit from snapshot stops that step, so the
// caller never plans, applies, or annotates on an older file.
const STOPS_ON_FAILURE = prose("If snapshot exits non-zero, stop");

test("AC-08: each place that builds the snapshot stops when the build exits non-zero", async () => {
  const goalSdlc = await readFile(new URL("../../goal-sdlc/SKILL.md", import.meta.url), "utf8");
  const refineBacklog = await readFile(new URL("../../refine-backlog-item/SKILL.md", import.meta.url), "utf8");
  const between = (text, from, to) => {
    const start = text.indexOf(from);
    const end = text.indexOf(to, start + from.length);
    assert.ok(start >= 0 && end > start, `missing section: ${from}`);
    return text.slice(start, end);
  };
  const places = {
    "goal-sdlc step 2": between(goalSdlc, "**Clean up, then select one parent.**", "3. **Run the lifecycle"),
    "complete-pr record step": between(
      skill,
      "## Record completion and close replaced issues",
      "## Close delivered issues for goal-sdlc",
    ),
    "complete-pr delegated cleanup": between(skill, "## Close delivered issues for goal-sdlc", "## Result"),
    "refine-backlog-item hierarchy close": between(
      refineBacklog,
      "node <plugin-root>/skills/complete-pr/scripts/closure.mjs snapshot",
      "## Record discovery and re-refinement state",
    ),
    "project-workflow standard": between(standard, "Each caller builds one closure snapshot", "never selects it."),
  };
  for (const [place, text] of Object.entries(places)) {
    assertBefore(text, BUILDS_SNAPSHOT, STOPS_ON_FAILURE, `${place} must stop when its snapshot build exits non-zero`);
  }
});
