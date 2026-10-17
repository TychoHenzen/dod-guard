import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const skillDirectory = fileURLToPath(new URL("../", import.meta.url));
const runner = await readFile(new URL("./run-advisor.mjs", import.meta.url), "utf8");
const schema = JSON.parse(await readFile(`${skillDirectory}response-schema.json`, "utf8"));

test("advisor runner does not impose a wall-clock kill", () => {
  assert.doesNotMatch(runner, /timeoutMs|--timeout-ms|setTimeout/);
});

test("advisor runner uses direct Windows executable invocation", () => {
  assert.match(runner, /resolveCodexExecutable/);
  assert.match(runner, /shell: false/);
  assert.match(runner, /buildCodexPreflightArgs/);
  assert.match(runner, /buildCodexExecArgs/);
  assert.match(runner, /codex-advisor-execution/);
});

test("advisor defaults to Sol max for confirmed blockers", () => {
  assert.match(runner, /optionValue\("--model", "gpt-5\.6-sol"\)/);
  assert.match(runner, /optionValue\("--reasoning-effort", "max"\)/);
  assert.match(runner, /model = "gpt-5\.6-sol"/);
  assert.match(runner, /reasoningEffort = "max"/);
  assert.doesNotMatch(runner, /gpt-5\.6-luna/);
});

test("the runner enforces the one-turn contract", () => {
  assert.match(runner, /function oneTurnViolation/);
  assert.match(runner, /new Set\(\["agent_message", "reasoning", "error"\]\)/);
});

test("advisor schema rejects whitespace-only advice", () => {
  assert.deepEqual(schema.required, ["advice"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.advice.type, "string");
  assert.equal(schema.properties.advice.minLength, 1);
  assert.equal(schema.properties.advice.pattern, "\\S");
});
