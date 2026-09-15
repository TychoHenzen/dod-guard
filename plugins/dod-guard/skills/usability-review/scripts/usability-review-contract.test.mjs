import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

test("usability-review is discoverable for user-facing review", () => {
  assert.match(skill, /^---\nname: usability-review\ndescription: .*user-facing.*planning, implementation, review, or handoff.*\n---/s);
  assert.match(skill, /Read and apply `standards\/working-defaults\.md`/);
  assert.match(skill, /explicitly or as a contextual review/);
});

test("usability-review selects evidence and follows the task journey", () => {
  for (const signal of [
    /intended user and their primary task/,
    /source, command help, API descriptions, configuration, and documentation/,
    /screenshots or mockups/,
    /live interaction/,
    /Discoverability:/,
    /Hierarchy and wording:/,
    /Affordances and input burden:/,
    /Progress and empty states:/,
    /Success and feedback:/,
    /Error and recovery:/,
    /semantic\s+structure/s,
    /visible focus/,
    /reduced motion/,
  ]) {
    assert.match(skill, signal);
  }
});

test("usability-review reports limits without claiming compliance or implementation", () => {
  for (const signal of [
    /Evidence unavailable:/,
    /Do not claim that an unobserved state passes/,
    /consent,\s+disclosure,\s+cost,\s+uncertainty,\s+verification,\s+undo/s,
    /\[high\|medium\|low\]/,
    /Impact:/,
    /Evidence:/,
    /Minimal change:/,
    /Verification:/,
    /does\s+not establish WCAG conformance/s,
    /Do not implement findings/,
    /Do not require a browser, MCP server, external dependency/,
  ]) {
    assert.match(skill, signal);
  }
});
