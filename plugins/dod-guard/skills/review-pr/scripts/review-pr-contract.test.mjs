import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const pluginRoot = new URL("../../../", import.meta.url);
const repositoryRoot = new URL("../../../../../", import.meta.url);
const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const usage = await readFile(new URL("USAGE.md", pluginRoot), "utf8");
const REVIEWERS = ["review-pr-feature", "review-pr-design", "review-pr-reliability", "review-pr-hygiene"];

test("review-pr plans, investigates, verifies, then judges in that order", () => {
  const order = [
    "## 3. Diff and slots",
    "## 5. Plan, investigate, judge",
    "One `dod-guard:read-strong` planner",
    "`dod-guard:read-cheap` investigators answer every",
    "Before judging, the main thread checks every answer",
    "Dispatch the four reviewers at once",
    "## 6. Build and post",
  ].map((phrase) => skill.search(prose(phrase)));
  assert.ok(order.every((index) => index >= 0), `missing step: ${order}`);
  assert.deepEqual([...order].sort((left, right) => left - right), order);
  assert.match(skill, prose("the plan, investigate, and judge split in `standards/model-routing.md`"));
  assert.match(skill, prose("cheap-output rule in that standard, with the reviewed head as the accepted head"));
  assert.doesNotMatch(skill, prose("every cited path and line exists"));
  assert.match(skill, prose("Ids are unique across all four lenses"));
  assert.match(skill, prose("slots --diff=<unified0.diff> --pbi=<pbi.json> --sub-issues=<sub-issues.json> --out=<slots.json>"));
  assert.match(skill, prose("Deletion-only files, pure renames, and binary files get no slot."));
  assert.match(skill, prose("The slots are fixed: the planner cannot add, drop, or rename one."));
  assert.match(skill, prose("A slot that needs no question gets one exclusion that names the lens that owns it and the reason; a slot never has both."));
  assert.match(skill, prose("Nobody investigates an exclusion."));
  assert.match(skill, prose("The build regenerates the slots and refuses a plan that misses, adds, or leaves empty a slot."));
  assert.match(skill, prose("A slot is assigned to a lens when it has a question of that lens or an exclusion that names that lens."));
  assert.match(skill, prose("reports an exclusion assigned to its lens as a finding when its reason does not hold"));
  assert.doesNotMatch(skill, /`excluded` entries|changed file unnamed/);
  assert.match(skill, prose("reports the gap as a finding; it never counts one as passing"));
  assert.match(skill, prose("Send a failed batch back once with the exact gap"));
  assert.match(skill, prose("judges from that evidence instead of re-reading the whole diff"));
  assert.match(skill, prose('record the stage as "requested, not pinned"'));
  assert.match(skill, prose("It returns one ruling for every slot assigned to its lens."));
  assert.match(skill, prose("Each returns one JSON object with `reviewer`, `rulings`, and `findings`."));
  assert.match(skill, prose("names the reviewer and slot for a missing, duplicate, or unassigned ruling or an unknown status"));
  assert.doesNotMatch(skill, /coverage/i);
});

test("review-pr posts the slot block without changing its boundaries", () => {
  assert.match(skill, prose("--plan=<plan.json> --results=<results.json> --out=<payload.json>"));
  assert.match(skill, prose("never from a slot list the planner returns"));
  assert.match(skill, prose("collapsed `<details>` block in the review body"));
  assert.match(skill, prose("The review event is always `COMMENT`"));
  assert.match(skill, prose("`dod-guard:review-pr` marker that step 2 detects"));
  assert.match(skill, prose("never post a second review"));
  assert.match(skill, prose("Never edit files, approve, mark ready, merge, or close anything."));
  assert.doesNotMatch(skill, /questions\.json/);
});

test("the four reviewers judge on the strong tier in Claude Code and Codex", async () => {
  for (const name of REVIEWERS) {
    const source = await readFile(new URL(`agents/${name}.md`, pluginRoot), "utf8");
    assert.match(source, /^model: opus$/m, name);
    assert.match(source, /^effort: medium$/m, name);
    assert.match(source, prose("Judge from that evidence instead of re-reading the whole diff."), name);
    assert.match(source, prose("The brief gives you the slots assigned to this lens"), name);
    const toml = await readFile(
      new URL(`.codex/agents/dod_guard_${name.replaceAll("-", "_")}.toml`, repositoryRoot),
      "utf8",
    );
    assert.match(toml, /^model = "gpt-5\.6-sol"$/m, name);
    assert.match(toml, /^model_reasoning_effort = "medium"$/m, name);
    assert.match(toml, /^sandbox_mode = "read-only"$/m, name);
    for (const [label, text] of [
      ["source", source],
      ["toml", toml],
    ]) {
      assert.match(
        text,
        prose('`rulings` holds one `{ "slot", "status", "evidence" }` entry for every slot assigned to this lens and for no other slot.'),
        `${name} ${label}`,
      );
      assert.doesNotMatch(text, /coverage/i, `${name} ${label}`);
    }
  }
});

test("USAGE describes the planner, investigators, and judges", () => {
  assert.match(usage, prose("generates fixed review slots from the diff and the PBI"));
  assert.match(usage, prose("cheap investigators answer each question with a cited path and line"));
  assert.match(usage, prose("the four reviewer agents judge them on the strong tier"));
  assert.match(usage, prose("with every slot and its questions in a collapsed block"));
  assert.match(usage, prose("ruling on every slot assigned to their lens"));
});
