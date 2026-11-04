import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { frontmatterValue, line, pluginRoot, repositoryRoot, TIER_AGENTS } from "./model-routing.test-support.mjs";

const EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);
const INHERIT_ALL_TOOLS = /^inheritAllTools:/m;

test("each tier agent pins its model and effort for Claude Code and Codex", async () => {
  for (const agent of TIER_AGENTS) {
    const source = await readFile(new URL(`agents/${agent.name}.md`, pluginRoot), "utf8");
    assert.match(source, line("model", agent.model, ": "), agent.name);
    const effort = frontmatterValue(source, "effort");
    assert.ok(EFFORT_LEVELS.has(effort), `${agent.name} effort must be a known level`);
    const codexEffort = frontmatterValue(source, "codex_effort") ?? effort;
    assert.equal(codexEffort, agent.codexEffort, agent.name);
    assert.ok(!source.includes("\r"), `${agent.name} must use LF line endings`);

    const tomlName = `dod_guard_${agent.name.replaceAll("-", "_")}.toml`;
    const toml = await readFile(new URL(`.codex/agents/${tomlName}`, repositoryRoot), "utf8");
    assert.match(toml, line("model", `"${agent.codex}"`, " = "), agent.name);
    assert.match(toml, line("model_reasoning_effort", `"${agent.codexEffort}"`, " = "), agent.name);
    assert.match(toml, line("sandbox_mode", `"${agent.sandbox}"`, " = "), agent.name);
  }
});

// Haiku charges five times more for a request whose prompt passes 100,000
// tokens, so the lean haiku workers compact below that line. The skill-capable
// haiku worker starts near 58,000 tokens and compacts at window minus 33,000, so
// a window of 110000 left it 19,000 tokens of room and it died thrashing; it
// declares 200000. Claude Code reads autoCompactWindow only as a plain integer
// from 100000 to 1000000 and ignores a value such as `200k`, so the test pins the
// digits. The window is the lower of this field and the user's per-model window,
// which a probe on Claude Code 2.1.299 confirmed for a subagent run under a model
// override.
const COMPACT_WINDOWS = {
  "stage-cheap": 110_000,
  "stage-cheap-skill": 200_000,
  "read-cheap": 110_000,
  "stage-standard": 250_000,
};

test("long-running agents declare a plain-integer autoCompactWindow", async () => {
  for (const agent of TIER_AGENTS) {
    const source = await agentText(agent.name);
    const expected = COMPACT_WINDOWS[agent.name];
    assert.equal(
      frontmatterValue(source, "autoCompactWindow"),
      expected === undefined ? undefined : String(expected),
      agent.name,
    );
  }
});

// Only an owner's thread dispatches: the stage agent that owns a split stage
// can spawn agents, and every row worker cannot.
const DISPATCH_TITLE = "only the skill-capable stage agents can dispatch";
const SKILL_CAPABLE_AGENTS = new Set(["stage-standard", "stage-cheap-skill"]);

test(DISPATCH_TITLE, async () => {
  // The skill-capable agents list Agent and Skill in an allowlist that holds no
  // MCP tool, which keeps their first call small; every other tier agent keeps
  // an allowlist without Agent.
  for (const agent of TIER_AGENTS) {
    const source = await readFile(new URL(`agents/${agent.name}.md`, pluginRoot), "utf8");
    const tools = source.match(/^tools: (.+)$/m)?.[1].split(", ");
    assert.ok(tools, `${agent.name} must declare a tools allowlist`);
    assert.equal(INHERIT_ALL_TOOLS.test(source), false, `${agent.name} must not inherit every tool`);
    assert.equal(
      tools.some((tool) => tool.startsWith("mcp__")),
      false,
      `${agent.name} must hold no MCP tool`,
    );
    const skillCapable = SKILL_CAPABLE_AGENTS.has(agent.name);
    assert.equal(tools.includes("Agent"), skillCapable, `${agent.name} Agent tool`);
    assert.equal(tools.includes("Skill"), skillCapable, `${agent.name} Skill tool`);
  }
});

function agentText(name) {
  return readFile(new URL(`agents/${name}.md`, pluginRoot), "utf8");
}

// Tool allowlists are the permission boundary: stage-cheap edits but holds no
// Skill or Agent, and the read agents hold no Write or Edit, which also keeps
// their Codex sandbox read-only. The two skill-capable workers hold PowerShell
// and the dispatch tools (Agent, Skill, SendMessage, and the web tools).
const TOOLS_LINES = {
  "stage-standard": "Read, Grep, Glob, Bash, PowerShell, Edit, Write, Agent, Skill, SendMessage, WebSearch, WebFetch",
  "stage-cheap-skill": "Read, Grep, Glob, Bash, PowerShell, Edit, Write, Agent, Skill, SendMessage, WebSearch, WebFetch",
  "stage-cheap": "Read, Grep, Glob, Bash, Edit, Write",
  "read-cheap": "Read, Grep, Glob, Bash",
  "read-standard": "Read, Grep, Glob, Bash",
};

const ALLOWLIST_TITLE = "the cheap and read-only agents keep their exact tool allowlists";

test(ALLOWLIST_TITLE, async () => {
  for (const [name, tools] of Object.entries(TOOLS_LINES)) {
    assert.match(await agentText(name), line("tools", tools, ": "), name);
  }
});

const PROGRESS_NOTE_PINS = [
  /one\s+progress\s+note\s+every\s+15\s+minutes\s+with\s+SendMessage/,
  /date\s+\+%H:%M/,
  /Get-Date\s+-Format\s+HH:mm/,
  /a\s+plain\s+output\s+line/,
  /A\s+note\s+is\s+not\s+a\s+stage\s+report/,
];
const PROGRESS_NOTE = /progress\s+note/;

for (const agent of ["stage-standard", "stage-cheap-skill"]) {
  test(`${agent} sends a progress note every 15 minutes`, async () => {
    const text = await agentText(agent);
    for (const pin of PROGRESS_NOTE_PINS) {
      assert.match(text, pin);
    }
  });
}

test("stage-cheap has no progress-note rule because it has no SendMessage", async () => {
  assert.doesNotMatch(await agentText("stage-cheap"), PROGRESS_NOTE);
});

const SHELL_AGENTS = ["stage-standard", "stage-cheap-skill", "stage-cheap", "read-cheap", "read-standard"];
const SHELL_RULES_START = "<!-- shell-rules:start -->";
const SHELL_RULES_END = "<!-- shell-rules:end -->";

function shellRulesBlock(source) {
  const start = source.indexOf(SHELL_RULES_START);
  const end = source.indexOf(SHELL_RULES_END);
  assert.ok(start >= 0 && end > start, "shell rules markers");
  return source.slice(start, end + SHELL_RULES_END.length);
}

test("every agent that runs a shell embeds the shared shell rules verbatim", async () => {
  const standard = await readFile(new URL("standards/shell-rules.md", pluginRoot), "utf8");
  const block = shellRulesBlock(standard);
  for (const name of SHELL_AGENTS) {
    assert.equal(shellRulesBlock(await agentText(name)), block, name);
  }
});

test("the generated Codex agents match their Claude sources", () => {
  const converter = fileURLToPath(new URL("skills/codex-migrate/scripts/convert-claude-agents.mjs", pluginRoot));
  const result = spawnSync(
    process.execPath,
    [
      converter,
      `--source=${fileURLToPath(new URL("agents", pluginRoot))}`,
      `--output=${fileURLToPath(new URL(".codex/agents", repositoryRoot))}`,
      "--check",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});
