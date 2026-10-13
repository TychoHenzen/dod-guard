import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { markdownSection } from "../../../lib/acceptance-criteria.mjs";
import { prose } from "../../../lib/skill-text.mjs";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const skill = await read("../SKILL.md");
const reporting = markdownSection(skill, "Reporting");
const usage = await read("../../../USAGE.md");

// The linked Project spans several repositories, and a goal run once reported
// the completion count without saying it covers only the target one (#821, #859).
const SCOPE =
  "only the target repository's parent and child PBIs whose Project status reads Done, as select-next's `counts` " +
  "report them, even when the linked Project spans several repositories.";

test("goal-sdlc reports the time and parent and child completions", () => {
  assert.match(skill, prose("Start every progress message with the local `[HH:MM]` time from the clock."));
  assert.match(
    reporting,
    prose(
      `Every progress message and the final report carry \`PBIs completed: P parent / C child\`, counting ${SCOPE}`,
    ),
  );
  assert.match(skill, prose("Otherwise update `PBIs completed: P parent / C child`"));
  assert.match(
    skill,
    prose(
      "When `/complete-pr` returns `conflict-triaged`,",
      "go to `/submit-draft-pr` for the new head, not to the completion owner.",
    ),
  );
  assert.doesNotMatch(skill, /PBIs completed: N/);
  for (const phrase of [
    "on a model tier from `standards/model-routing.md`",
    "the strong tier (Opus at medium effort, `gpt-5.6-sol` in Codex) plans, decides, and judges",
    "the cheap tier (Haiku at max effort, `gpt-5.6-luna` in Codex)",
    "starts with the local `[HH:MM]` time",
    `\`PBIs completed: P parent / C child\`. That figure counts ${SCOPE}`,
  ]) {
    assert.match(usage, prose(phrase), phrase);
  }
});
