import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const fixtures = await readFile(new URL("../fixtures.md", import.meta.url), "utf8");

test("maps every substantive supplied detail into captured issues or an explicit remainder", () => {
  assert.match(skill, /map every substantive supplied\s+detail to that feature, every relevant feature, or an explicit unresolved\s+remainder/);
  assert.match(skill, /rationale, examples, constraints,\s+decisions, and open questions/);
  assert.match(skill, /Do not silently omit, collapse, or paraphrase a\s+concrete detail into a vague outcome/);
  assert.match(skill, /every mapped fact, rationale, example, constraint, and decision/);
  assert.match(skill, /Do not derive, resolve, or organize new[\s\S]*retain any supplied\s+decision verbatim as `## Context`/);
  assert.match(fixtures, /Both issues retain the shared constraint/);
  assert.match(fixtures, /A retains the supplied decision in `## Context`/);
  assert.match(fixtures, /explicit unresolved remainder and ask where it belongs/);
});
