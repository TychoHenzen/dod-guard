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
  assert.match(standard, prose("posts one comment with this heading on each linked closing issue and each finalized child"));
  assert.match(standard, prose("`<!-- dod-guard-completion-evidence -->`"));
  for (const field of ["pullRequest", "mergeCommit", "trustedHeadSha", "requiredChecks", "pendingRows"]) {
    assert.ok(standard.includes(`\`${field}\``), field);
  }
  assert.match(standard, prose("A record with pending rows is `merged-pending`, not verified."));
  assert.match(standard, prose("Comment text alone is never trusted."));
  assert.match(standard, prose("is a hold with a named reason and no write"));
  assert.match(
    standard,
    prose(
      "is planned as a status repair,",
      "so a rerun finishes a stopped Done write without a second comment or close.",
    ),
  );
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

test("every caller saves the one closure snapshot the standard defines", async () => {
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
