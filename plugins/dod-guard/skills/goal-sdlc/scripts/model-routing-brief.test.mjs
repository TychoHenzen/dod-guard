import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pluginRoot } from "./model-routing.test-support.mjs";

const BRIEF_CLOSING_SENTENCE =
  "Run every build and test to completion with its output redirected to a file, and never pipe it into head, " +
  "tail, or Select-Object -First. Wait for each command's terminal state and wrap none in a deadline. " +
  "Return no interim statement: your report is complete only when it carries every section named above.";
const CLOSING_INTRO = "verbatim, so every worker receives the rules that cost a failed run when missing:";

test("the stage brief standard carries its closing sentence verbatim, as a quoted rule", async () => {
  const standard = await readFile(new URL("standards/model-routing.md", pluginRoot), "utf8");
  const stageBrief = standard.slice(standard.indexOf("## Stage brief")).replace(/\s+/g, " ");
  assert.ok(stageBrief.includes(CLOSING_INTRO), "closing sentence introduction is missing");
  assert.ok(stageBrief.includes(`"${BRIEF_CLOSING_SENTENCE}"`), "closing sentence drifted from the quoted rule");
});
