// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { readFile } from "node:fs/promises";

export const skill = await readFile(new URL("../../SKILL.md", import.meta.url), "utf8");

export function assertInOrder(text, patterns) {
  let previous = -1;
  for (const pattern of patterns) {
    const position = text.search(pattern);
    assert.ok(position > previous, `${pattern} must follow the preceding step`);
    previous = position;
  }
}

export function sectionBetween(startHeading, endHeading) {
  const start = skill.indexOf(startHeading);
  const end = skill.indexOf(endHeading);
  assert.notEqual(start, -1, `${startHeading} must exist`);
  assert.ok(end > start, `${endHeading} must follow ${startHeading}`);
  return skill.slice(start, end);
}
