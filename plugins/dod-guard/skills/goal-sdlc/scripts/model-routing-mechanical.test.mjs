import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pluginRoot } from "./model-routing.test-support.mjs";

const AGENT = "agents/stage-cheap.md";
const SECTION = "## Mechanical gaps";
const NEXT_HEADING = /\n## /;
const DEFERRAL = "and the gap is not mechanical";

function squash(text) {
  return text.replace(/\s+/g, " ");
}

// Returns the raw text from one level-two heading to the next heading or the end of the file.
async function section(path, heading) {
  const source = await readFile(new URL(path, pluginRoot), "utf8");
  const start = source.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `${path} must hold the heading ${heading}`);
  const body = source.slice(start + heading.length + 2);
  const end = body.search(NEXT_HEADING);
  return end < 0 ? body : body.slice(0, end);
}

function assertIncludesAll(text, phrases) {
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase), `missing phrase: ${phrase}`);
  }
}

test("stage-cheap names exactly the three mechanical gap kinds", async () => {
  const kinds = (await section(AGENT, SECTION)).split("\n").filter((row) => row.startsWith("- "));
  assert.equal(kinds.length, 3);
  assertIncludesAll(kinds.join(" "), ["Visibility:", "Ordering:", "Missing import:"]);
});

test("a mechanical fix is reported and bounded", async () => {
  const text = squash(await section(AGENT, SECTION));
  assertIncludesAll(text, [
    "Mechanical fix: <file>: <what changed and why>",
    "inside a file a `File:` line of the plan names",
    "changes no signature, return value, test assertion, or expected result",
    "never commits, pushes, or touches issue or Project state",
    "A symbol that only a test uses is not mechanical",
    "Never reorder the steps of the plan",
  ]);
});

test("any other gap still stops the worker", async () => {
  const text = squash(await section(AGENT, SECTION));
  assertIncludesAll(text, ["Any other gap is not mechanical", "Stop at that step and report the exact gap."]);
});

test("both older stop rules defer to the mechanical gaps section", async () => {
  const source = squash(await readFile(new URL(AGENT, pluginRoot), "utf8"));
  assert.equal(source.split(DEFERRAL).length - 1, 2);
});
