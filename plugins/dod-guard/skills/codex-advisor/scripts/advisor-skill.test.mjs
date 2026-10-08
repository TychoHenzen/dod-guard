import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const skillDirectory = fileURLToPath(new URL("../", import.meta.url));
const skill = await readFile(`${skillDirectory}SKILL.md`, "utf8");
const runner = await readFile(new URL("./run-advisor.mjs", import.meta.url), "utf8");
const schema = JSON.parse(await readFile(`${skillDirectory}response-schema.json`, "utf8"));

test("advisor skill has the Codex invocation contract", () => {
  assert.match(skill, /^---\nname: codex-advisor\n/m);
  for (const signal of [
    /scripts[\\/]run-advisor\.mjs/,
    /`gpt-5\.6-sol` with\s+`max` effort by default/,
    /does not enumerate reasoning values/i,
    /empty,\s+non-repository working directory/,
    /-s read-only/,
    /--ignore-user-config/,
    /--ignore-rules/,
    /--skip-git-repo-check/,
    /--ephemeral/,
    /waits for the advisor process to exit/,
    /cleans up\s+its temporary\s+directory on every\s+exit path/,
    /stdin/,
    /--output-schema/,
    /--model/,
    /requested model and reasoning effort/i,
    /skip repository research/,
    /avoid\s+all tools and mutations/,
    /codex\.exe.*Windows|Windows.*codex\.exe/i,
  ]) {
    assert.match(skill, signal);
  }
  assert.doesNotMatch(skill, /codec\s+exec/);
  assert.doesNotMatch(skill, /dangerously-bypass/);
  assert.doesNotMatch(skill, /researched host/);
});

test("advisor skill uses Claude's advisor tool and falls back to Codex", () => {
  const choose = skill.indexOf("## Choose the advisor");
  const claude = skill.indexOf("## Claude Code: the built-in advisor");
  const codex = skill.indexOf("## Invoke Codex");
  assert.ok(choose !== -1 && choose < claude && claude < codex);
  assert.match(skill, /when the `advisor` tool is available, use it and skip the\s+Codex runner/);
  assert.match(skill, /Otherwise, including every Codex session, use "Invoke Codex"/);
  assert.match(skill, /Write the brief in this turn[\s\S]*Call `advisor` right after it/);
  assert.match(skill, /reads the full transcript, not only the brief/);
  assert.match(skill, /Record the advisor as\s+"Claude advisor tool"/);
});

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
  assert.doesNotMatch(`${skill}\n${runner}`, /gpt-5\.6-luna/);
});

test("the Codex path keeps the built-in advisor's one-turn, full-context contract", () => {
  for (const signal of [
    /exactly one `codex exec` turn that returns\s+one advice object/,
    /no resume, no follow-up turn, and no retry inside the\s+request/,
    /makes no edits, and makes no repository, branch, pull-request, or\s+GitHub reads or writes/,
    /the calling agent supplies\s+the full context/,
    /the task, the evidence gathered so far \(paths and\s+lines, quoted facts, command results\)/,
    /the relevant diffs when the question\s+concerns code/,
    /candidate decision with its recommended default and the\s+exact question/,
    /When the context is insufficient, it says so in its advice/,
    /fails the run, and no advice is used/,
    /the\s+runner itself never retries/,
  ]) {
    assert.match(skill, signal);
  }
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
