import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

test("wiring-audit is discoverable for planning, implementation, and review", () => {
  assert.match(skill, /^---\nname: wiring-audit\ndescription: .*planning, implementation, or review.*\n---/s);
  assert.match(skill, /Read and apply `standards\/working-defaults\.md`/);
  assert.match(skill, /explicitly or as a contextual check during planning, before\s+implementation, and before review or handoff/s);
});

test("wiring-audit traces the user path without inventing surfaces", () => {
  for (const signal of [
    /intended user/,
    /Discovery:/,
    /Setup:/,
    /Entry point:/,
    /Inputs:/,
    /Result:/,
    /Failure:/,
    /Recovery:/,
    /JSON-only or library-only/,
    /Do not invent a user, task, interface, command/,
    /intentionally internal behavior/,
  ]) {
    assert.match(skill, signal);
  }
});

test("wiring-audit reports evidence limits and actionable findings", () => {
  for (const signal of [
    /Classify each relevant surface as `verified`,\s+`missing`,\s+`contradicted`,\s+`unverified`, or `not applicable`/s,
    /precise path and line, heading,\s+symbol, route, command, or configuration key/s,
    /Evidence limits:/,
    /Minimal next action:/,
    /Verification:/,
    /Do not implement the\s+finding/s,
  ]) {
    assert.match(skill, signal);
  }
});
