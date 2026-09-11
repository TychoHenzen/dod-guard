import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const skillDirectory = fileURLToPath(new URL("../", import.meta.url));
const skill = await readFile(`${skillDirectory}SKILL.md`, "utf8");
const schema = JSON.parse(await readFile(`${skillDirectory}response-schema.json`, "utf8"));

test("advisor skill has the bounded Codex invocation contract", () => {
  assert.match(skill, /^---\nname: codex-advisor\n/m);
  for (const signal of [
    /codex exec/,
    /model_reasoning_effort=low/,
    /-s read-only/,
    /--ephemeral/,
    /--output-last-message/,
    /stdin/,
    /--output-schema/,
    /skip repository research/,
    /avoid all tools and mutations/,
  ]) {
    assert.match(skill, signal);
  }
  assert.doesNotMatch(skill, /codec\s+exec/);
  assert.doesNotMatch(skill, /dangerously-bypass/);
});

test("advisor schema requires one non-empty advice string", () => {
  assert.deepEqual(schema.required, ["advice"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.advice.type, "string");
  assert.equal(schema.properties.advice.minLength, 1);
});

test("advisor failures are observable and never relayed as advice", () => {
  for (const signal of [
    /executable is missing or cannot start/,
    /exits non-zero/,
    /output file is missing, empty, not valid JSON/,
    /Do not hide a command failure behind a guessed or partial answer/,
  ]) {
    assert.match(skill, signal);
  }
});
