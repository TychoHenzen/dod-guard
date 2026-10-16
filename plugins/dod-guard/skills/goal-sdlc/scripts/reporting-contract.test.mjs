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

// Fixed per-message templates made reports unreadable to the owner, so progress
// messages are free-form and only the final report carries the count.
test("goal-sdlc reports parent and child completions only in the final report", () => {
  assert.match(reporting, prose("Progress messages have no fixed format."));
  assert.match(
    reporting,
    prose(`The final report says how many parent and child PBIs reached Done, counting ${SCOPE}`),
  );
  assert.doesNotMatch(skill, /\[HH:MM\]/);
  assert.doesNotMatch(skill, /PBIs completed/);
  assert.match(
    skill,
    prose(
      "When `/complete-pr` returns `conflict-triaged`,",
      "go to `/submit-draft-pr` for the new head, not to the completion owner.",
    ),
  );
  for (const phrase of [
    "on a model tier from `standards/model-routing.md`",
    "by one rule: haiku for anything that needs a lot of effort but low intelligence, " +
      "sonnet only for tasks that need the added intelligence",
    "The cheap tier (Haiku, `gpt-5.6-luna` in Codex) implements every task from a written step plan",
    "The standard tier (Sonnet, `gpt-5.6-terra` in Codex) plans, decides, and judges, " +
      "and owns the stages that write plans or absorb a failed row",
    "runs on the skill-capable agent of the owner's own tier",
    "The strong tier (Opus, `gpt-5.6-sol` in Codex) is reached only by escalation",
    "Run the `/goal` session itself on a standard-tier model",
    `The final report says how many parent and child PBIs reached Done. That figure counts ${SCOPE}`,
  ]) {
    assert.match(usage, prose(phrase), phrase);
  }
});
