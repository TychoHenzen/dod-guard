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
  assert.match(skill, prose("Together the questions name every changed file in their `files` lists"));
  assert.match(skill, prose("The build refuses a plan that leaves a changed file unnamed."));
  assert.match(skill, prose("reports the gap as a finding; it never counts one as passing"));
  assert.match(skill, prose("Send a failed batch back once with the exact gap"));
  assert.match(skill, prose("judges from that evidence instead of re-reading the whole diff"));
  assert.match(skill, prose('record the stage as "requested, not pinned"'));
});

test("review-pr posts the questions block without changing its boundaries", () => {
  assert.match(skill, prose("--results=<results.json> --questions=<questions.json> --out=<payload.json>"));
  assert.match(skill, prose("collapsed `<details>` block in the review body"));
  assert.match(skill, prose("The review event is always `COMMENT`"));
  assert.match(skill, prose("`dod-guard:review-pr` marker that step 2 detects"));
  assert.match(skill, prose("never post a second review"));
  assert.match(skill, prose("Never edit files, approve, mark ready, merge, or close anything."));
});

test("the four reviewers judge on the strong tier in Claude Code and Codex", async () => {
  for (const name of REVIEWERS) {
    const source = await readFile(new URL(`agents/${name}.md`, pluginRoot), "utf8");
    assert.match(source, /^model: opus$/m, name);
    assert.match(source, /^effort: medium$/m, name);
    assert.match(source, prose("Judge from that evidence instead of re-reading the whole diff."), name);
    const toml = await readFile(
      new URL(`.codex/agents/dod_guard_${name.replaceAll("-", "_")}.toml`, repositoryRoot),
      "utf8",
    );
    assert.match(toml, /^model = "gpt-5\.6-sol"$/m, name);
    assert.match(toml, /^model_reasoning_effort = "medium"$/m, name);
    assert.match(toml, /^sandbox_mode = "read-only"$/m, name);
  }
});

test("USAGE describes the planner, investigators, and judges", () => {
  assert.match(
    usage,
    prose("strong planner then writes questions for the feature, design, reliability, and hygiene lenses"),
  );
  assert.match(usage, prose("cheap investigators answer each one with a cited path and line"));
  assert.match(usage, prose("the four reviewer agents judge them on the strong tier"));
  assert.match(usage, prose("with the planned questions in a collapsed block"));
});
