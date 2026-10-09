import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

// Codex ignores or caps spawn-time model overrides, so each tier is pinned in
// its agent file. These tests pin both the Claude source and the generated
// Codex registration.
const pluginRoot = new URL("../../../", import.meta.url);
const repositoryRoot = new URL("../../../../../", import.meta.url);

const TIER_AGENTS = [
  { name: "stage-strong", model: "opus", effort: "medium", codex: "gpt-5.6-sol", sandbox: "workspace-write" },
  { name: "stage-cheap", model: "haiku", effort: "max", codex: "gpt-5.6-luna", sandbox: "workspace-write" },
  { name: "read-strong", model: "opus", effort: "medium", codex: "gpt-5.6-sol", sandbox: "read-only" },
  { name: "read-cheap", model: "haiku", effort: "max", codex: "gpt-5.6-luna", sandbox: "read-only" },
];

function line(key, value, separator) {
  return new RegExp(`^${key}${separator}${value}$`, "m");
}

test("each tier agent pins its model and effort for Claude Code and Codex", async () => {
  for (const agent of TIER_AGENTS) {
    const source = await readFile(new URL(`agents/${agent.name}.md`, pluginRoot), "utf8");
    assert.match(source, line("model", agent.model, ": "), agent.name);
    assert.match(source, line("effort", agent.effort, ": "), agent.name);
    assert.ok(!source.includes("\r"), `${agent.name} must use LF line endings`);

    const tomlName = `dod_guard_${agent.name.replaceAll("-", "_")}.toml`;
    const toml = await readFile(new URL(`.codex/agents/${tomlName}`, repositoryRoot), "utf8");
    assert.match(toml, line("model", `"${agent.codex}"`, " = "), agent.name);
    assert.match(toml, line("model_reasoning_effort", `"${agent.effort}"`, " = "), agent.name);
    assert.match(toml, line("sandbox_mode", `"${agent.sandbox}"`, " = "), agent.name);
  }
});

const standard = await readFile(new URL("standards/model-routing.md", pluginRoot), "utf8");

test("the routing standard defines the tiers, runtime rules, and verification once", () => {
  for (const phrase of [
    "The strong tier is for judgement with modest reasoning effort",
    "The cheap tier is for mechanical, high-volume work with high reasoning effort",
    "| strong | `opus`, `medium` |",
    "| cheap | `haiku`, `max` |",
    "`gpt-5.6-sol`, `medium`",
    "`gpt-5.6-luna`, `max`",
    "the Agent call's `model` and `effort` override the agent's frontmatter",
    "spawn-time model and effort values can be ignored or capped",
    "A Codex stage is pinned only when it runs through a registered agent",
    '"requested, not pinned"',
    "A model or effort the user names for a stage wins over the tier for that run.",
    "use a registered agent whose file sets exactly the named model and effort",
    "Never dispatch the stage's own pinned tier agent and report the override as applied.",
    "every cited path and line exists at the accepted head",
    "and says what the answer claims it says",
    "nothing claims a verdict, or a change the step did not ask for",
    "A failed check sends the same stage back once",
    "The run does not advance on unverified output.",
    "advice-only role: `gpt-5.6-sol` at `max` effort, one turn, read-only",
  ]) {
    assert.match(standard, prose(phrase), phrase);
  }
  for (const agent of TIER_AGENTS) {
    assert.ok(standard.includes(`dod-guard:${agent.name}`), agent.name);
  }
});

// Only an owner's thread dispatches: the stage agent that owns a split stage
// can spawn agents, and every row worker cannot.
test("only the strong stage agent can dispatch subagents or use MCP connectors", async () => {
  // stage-strong has no tools allowlist, so it inherits Agent and MCP tools;
  // every other tier agent keeps an allowlist without Agent.
  for (const agent of TIER_AGENTS) {
    const source = await readFile(new URL(`agents/${agent.name}.md`, pluginRoot), "utf8");
    const tools = source.match(/^tools: (.+)$/m)?.[1].split(", ");
    if (agent.name === "stage-strong") {
      assert.equal(tools, undefined, "stage-strong must inherit every tool");
    } else {
      assert.ok(tools && !tools.includes("Agent"), agent.name);
    }
  }
  for (const phrase of [
    "Only the thread that owns a skill's procedure dispatches its subagents.",
    "A worker dispatched for one row never dispatches further",
    "goal-sdlc's main thread runs that owner's procedure itself",
    "`/review-pr`, or the conflict triage in `standards/conflict-triage.md`), it runs that stage on `dod-guard:stage-strong`",
  ]) {
    assert.match(standard, prose(phrase), phrase);
  }
});

// Tier definitions live in the standard only; delegating skills refer to it.
test("no skill or other standard restates the tier definitions", async () => {
  const skillsRoot = new URL("skills/", pluginRoot);
  const names = (await readdir(skillsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  const texts = await Promise.all(
    names.map((entry) => readFile(new URL(`${entry.name}/SKILL.md`, skillsRoot), "utf8")),
  );
  for (const file of ["working-defaults.md", "project-workflow.md", "github-request-discipline.md", "conflict-triage.md"]) {
    texts.push(await readFile(new URL(`standards/${file}`, pluginRoot), "utf8"));
  }
  for (const text of texts) {
    assert.doesNotMatch(text, prose("The strong tier is for"));
    assert.doesNotMatch(text, prose("The cheap tier is for"));
  }
});

// The triage standard names tiers and tier agents but never a value, so a
// tier change lands in the routing standard alone.
test("the conflict triage standard names no model or effort value", async () => {
  const triage = await readFile(new URL("standards/conflict-triage.md", pluginRoot), "utf8");
  assert.doesNotMatch(triage, /\b(opus|sonnet|haiku|fable)\b|gpt-\d/i);
  assert.doesNotMatch(triage, /`(low|medium|high|xhigh|max)`|\b(low|medium|high|xhigh|max) effort\b/i);
  assert.ok(triage.includes("`standards/model-routing.md`"));
});

test("delegating skills refer to the routing standard", async () => {
  for (const name of ["goal-sdlc", "refine-backlog-item", "review-pr"]) {
    const text = await readFile(new URL(`skills/${name}/SKILL.md`, pluginRoot), "utf8");
    assert.ok(text.includes("`standards/model-routing.md`"), name);
  }
});
