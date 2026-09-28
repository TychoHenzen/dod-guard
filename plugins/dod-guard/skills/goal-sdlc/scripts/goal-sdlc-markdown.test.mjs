import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ESCAPED_SPACE = /&#x20;/;
const ESCAPED_LIST_NUMBER = /^\d\\\. /m;
const BLANK_RUN = /\n\n\n/;
const CAPS_HEADING = /^[A-Z][A-Z ]{8,}$/m;

test("goal-sdlc is clean Markdown without conversion debris", async () => {
  const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

  assert.doesNotMatch(skill, ESCAPED_SPACE);
  assert.doesNotMatch(skill, ESCAPED_LIST_NUMBER);
  assert.doesNotMatch(skill, BLANK_RUN);
  assert.doesNotMatch(skill, CAPS_HEADING);
});
