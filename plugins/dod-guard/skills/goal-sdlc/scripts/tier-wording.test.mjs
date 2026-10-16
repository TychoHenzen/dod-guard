// Order and coverage pins for the tier wording (issue 958): the ladder rungs
// are asserted as a sequence, and the tier definitions plus the USAGE.md tier
// statements are pinned so reverting one sentence fails a named test.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const pluginRoot = new URL("../../../", import.meta.url);
const standard = await readFile(new URL("standards/model-routing.md", pluginRoot), "utf8");
const usage = await readFile(new URL("USAGE.md", pluginRoot), "utf8");

function section(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `${from} exists`);
  const end = to ? text.indexOf(to, start) : text.length;
  assert.ok(end > start, `${to} follows ${from}`);
  return text.slice(start, end);
}

test("the cheap-model ladder runs send-back, sonnet, advisor, opus, blocker in order", () => {
  const ladder = section(standard, "A cheap-model skill-capable stage,", "Dispatching a read-only row");
  assert.match(
    ladder,
    prose(
      "stops and reports the failure record to its dispatcher",
      "sends the stage back once at haiku",
      "`model: sonnet`",
      "the cheap-to-standard rung skips the advisor",
      "sends it back once, asks `/codex-advisor` its one question",
      "`model: opus`",
      "A failure on the opus run stops the stage as a blocker.",
    ),
  );
});

test("the numbered order names the advisor before the strong rung", () => {
  const order = section(standard, "A stalled stage proceeds in this order:", "The escalating thread");
  assert.match(
    order,
    prose(
      "1. Send the stage back once at the same tier",
      "2. Before the strong rung only, ask `/codex-advisor` one question",
      "3. Run the stage again one rung up",
      "4. A failure on the strong rung stops the parent as a blocker",
    ),
  );
});

test("the tier definitions name the work of each tier", () => {
  const tiers = section(standard, "## Tiers", "## Applying a tier");
  assert.match(
    tiers,
    prose(
      "The cheap tier is for work that needs a lot of effort but low intelligence:",
      "implementing one task from the owner's written step plan, applying a written",
      "plan, running validations, regenerating artifacts, reading files to answer",
      "planned questions, capturing backlog items, and running a stage whose gates",
      "are fail-closed scripts and named stop codes that the dispatcher re-verifies",
      "The standard tier is for tasks that need the added intelligence: planning what",
      "to look for, deciding scope and acceptance, writing step plans, judging",
      "evidence into findings, designing remediation, and owning a stage whose thread",
      "must carry out a failed row.",
      "The strong tier is for escalation only.",
    ),
  );
});

test("USAGE.md states the tier assignments and the escalation rule", () => {
  const tiers = section(usage, "The\ncheap tier (Haiku", "The final");
  assert.match(
    tiers,
    prose(
      "The cheap tier (Haiku, `gpt-5.6-luna` in Codex) implements every task from a",
      "written step plan, runs validations, answers planned questions, drafts the pull",
      "request, runs the `/review-pr` owner thread, and completes the guarded merge.",
      "The standard tier (Sonnet, `gpt-5.6-terra` in Codex) plans, decides, and",
      "judges, and owns the stages that write plans or absorb a failed row.",
      "The strong tier (Opus, `gpt-5.6-sol` in Codex) is reached only by escalation",
      "The main thread checks cheap-tier output before anything relies on it",
      "runs on the skill-capable agent of the owner's own tier",
    ),
  );
});
