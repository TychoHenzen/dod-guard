import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";
import {
  assertPhrases,
  frontmatterValue,
  line,
  pluginRoot,
  repositoryRoot,
  standard,
  TIER_AGENTS,
} from "./model-routing.test-support.mjs";

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
  for (const phrase of [
    "Haiku 5.5 charges five times more for every request whose prompt passes 100,000 tokens",
    "A Haiku request over that line still costs about half as much as a Sonnet request of the same size",
    "A Claude Code agent compacts when its context reaches its window minus 33,000 tokens",
    "Its window is the lower of its `autoCompactWindow` frontmatter field and the window of the model it runs on",
    "The field is a plain integer of tokens from 100000 to 1000000",
    "A window must leave room above the start size of the agent",
    'the run ends with the error "Autocompact is thrashing"',
    "The lean Haiku agents, `dod-guard:stage-cheap` and `dod-guard:read-cheap`, " +
      "start near 30,000 tokens and declare 110000",
    "The skill-capable Haiku agent, `dod-guard:stage-cheap-skill`, starts near 58,000 tokens",
    "so it declares 200000 and compacts at 167,000 tokens",
    "The user's window for Haiku must be at least 200000 for that value to apply",
    "`dod-guard:stage-standard` declares 250000",
    "One agent cannot declare both a Sonnet window and a Haiku window, " +
      "which is why the cheap tier has its own skill-capable agent",
    "The `CLAUDE_CODE_AUTO_COMPACT_WINDOW` environment variable overrides all of these",
  ]) {
    assert.match(standard, prose(phrase), phrase);
  }
});

test("the routing standard defines the tiers, runtime rules, and verification once", () => {
  for (const phrase of [
    "The cheap tier is for work that needs a lot of effort but low intelligence:",
    "The standard tier is for tasks that need the added intelligence:",
    "haiku for anything that needs a lot of effort but low intelligence, " +
      "sonnet only for tasks that need the added intelligence",
    "The strong tier is for escalation only. No stage starts on it",
    "| standard | `sonnet`; effort from frontmatter |",
    "| cheap | `haiku`; effort from frontmatter |",
    "| strong | `opus`, effort `high` |",
    "`gpt-5.6-terra`; effort from frontmatter",
    "`gpt-5.6-luna`; `codex_effort`",
    "`gpt-5.6-sol`, effort `high`",
    "The strong tier has no agent of its own",
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
  for (const phrase of [
    "Only the thread that owns a skill's procedure dispatches its subagents.",
    "A worker dispatched for one row never dispatches further",
    "goal-sdlc's main thread runs that owner's procedure itself",
    "or the conflict triage in `standards/conflict-triage.md`),",
    "it runs that stage on the skill-capable agent of the stage's tier: `dod-guard:stage-standard`, or",
    "`dod-guard:stage-cheap-skill` for an owner whose tier is cheap",
    "Those two are the only tier agents that hold the Agent and Skill tools.",
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
  const files = ["working-defaults.md", "project-workflow.md", "github-request-discipline.md", "conflict-triage.md"];
  for (const file of files) {
    texts.push(await readFile(new URL(`standards/${file}`, pluginRoot), "utf8"));
  }
  for (const text of texts) {
    assert.doesNotMatch(text, prose("The standard tier is the default"));
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

function agentText(name) {
  return readFile(new URL(`agents/${name}.md`, pluginRoot), "utf8");
}

// Tool allowlists are the permission boundary: stage-cheap edits but holds no
// Skill or Agent, and the read agents hold no Write or Edit, which also keeps
// their Codex sandbox read-only.
const TOOLS_LINES = {
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

// Capability follows the agent and cost follows the model, so a cheap stage
// that needs a skill or a GitHub write runs on stage-cheap-skill and is still
// verified as cheap output.
const SKILL_CAPABLE = [
  "A skill-capable stage runs on its tier's skill-capable agent at that tier's",
  "model and effort: `dod-guard:stage-standard` for the standard tier,",
  "`dod-guard:stage-cheap-skill` for the cheap tier, and `dod-guard:stage-standard`",
  "with `model: opus` for the strong tier.",
  "invokes a skill or writes issue, pull request, or Project state:",
  "In Claude Code, pass the tier's `model` and `effort` on the Agent call.",
  "the registered files pin the standard and cheap tiers, so spawn a strong-tier stage " +
    "without a pinned file, with `gpt-5.6-sol` and `high` at spawn time, and record it as " +
    '"requested, not pinned".',
  "Cheap-output verification applies by model tier, not by agent type",
  "a readback of any issue, pull request, or Project state the step wrote",
];

test("a skill-capable stage runs on its tier's skill-capable agent", () => {
  assertPhrases(standard, SKILL_CAPABLE, "model-routing.md");
});

// The tier agents hold no MCP connector, so a proof that calls a runtime MCP
// tool goes back to the dispatcher, which holds the session's MCP tools.
test("a runtime MCP proof is made by the dispatcher", () => {
  assertPhrases(
    standard,
    [
      "No tier agent holds an MCP connector",
      "A proof that calls a runtime MCP tool, as `/next-ticket` describes for a game, an app, or an emulator,",
      "is a misrouted step for the agent that reaches it",
      "Its dispatcher, which holds the session's own MCP tools, makes that call on its own thread",
      "passes the result in the brief when the same stage resumes at its checkpoint",
    ],
    "model-routing.md",
  );
});

// A row worker cannot write the main thread's trailer and must not push
// unverified work, so the thread that dispatched it owns commit and push. A
// run that owns a skill's procedure is that skill's main thread on any model.
const COMMIT_OWNERSHIP = [
  "the changed files and staged state match the diff the step describes",
  "the dispatching main thread commits the verified changes with its own " +
    "attribution trailer, and pushes when the owning skill pushes.",
  "A worker dispatched for one planned step or row never commits or pushes, " +
    "whatever its tier or agent; the dispatching main thread does.",
  "A run that owns a skill's procedure, such as `/complete-pr` or " +
    "`/fix-pr-review`, is that skill's main thread even on the cheap model, " +
    "so it commits and pushes as the skill directs",
  "its dispatcher checks every commit and push it reports by reading them " + "back.",
  "A failed check sends the same stage back once with the exact gap, under " +
    "the failure-recovery rule in `standards/working-defaults.md`, with no " +
    "commit or push.",
];

const COMMIT_TITLE = "the main thread commits and pushes verified cheap-tier changes";

test(COMMIT_TITLE, async () => {
  assertPhrases(standard, COMMIT_OWNERSHIP, "model-routing.md");
  assert.doesNotMatch(standard, prose("every claimed commit exists"));
  assert.doesNotMatch(standard, prose("Cheap workers never commit or push"));
  const stageCheap = await agentText("stage-cheap");
  assertPhrases(
    stageCheap,
    ["stage them only when the brief says to stage", "so you never commit or push"],
    "stage-cheap.md",
  );
  assert.doesNotMatch(stageCheap, prose("Commit only when the brief asks"));
});

// stage-cheap stops on a step it cannot do, so the standard must say where
// that step goes instead of letting it fall under the failed-check rule.
const MISROUTED = [
  "A `dod-guard:stage-cheap` report that a step is misrouted is not a " + "failed check.",
  "The main thread redispatches that step once on `dod-guard:stage-cheap-skill`, " +
    "as a skill-capable stage, and verifies the result as cheap-tier output.",
];

test("a misrouted cheap step is redispatched on stage-cheap-skill", () => {
  assertPhrases(standard, MISROUTED, "model-routing.md");
});

// Read-only agents have no Write tool, so whoever owns the procedure persists
// their plans, questions, and decisions.
const READ_ONLY_RETURN = [
  "Return your output as text in your final message, and write no file, " + "Bash redirection and heredocs included.",
  "The main thread writes any handoff file",
];

const TRIAGE_HANDOFF = [
  "return questions as text; the owning thread writes them to a scratch " + "file outside the repository",
  "Return one decision per path:",
  "The owning thread writes the decisions to the decisions file",
];

const HANDOFF_TITLE = "read-only agents return text and the owning thread writes handoff files";

test(HANDOFF_TITLE, async () => {
  assertPhrases(
    standard,
    ["Read-only agents return their output as text.", "The main thread writes any handoff file"],
    "model-routing.md",
  );
  for (const name of ["read-cheap", "read-standard"]) {
    assertPhrases(await agentText(name), READ_ONLY_RETURN, name);
  }
  const triageUrl = new URL("standards/conflict-triage.md", pluginRoot);
  const triage = await readFile(triageUrl, "utf8");
  assertPhrases(triage, TRIAGE_HANDOFF, "conflict-triage.md");
});

// Each workaround answers a tool failure a cheap worker hit in a friction log.
const STAGE_CHEAP_WORKAROUNDS = [
  "When the step needs a skill or a GitHub write, stop and report it as misrouted",
  "That step belongs on `dod-guard:stage-cheap-skill`.",
  "Write file content with the Write tool instead of heredocs or echo " + "redirection",
  "When Edit cannot match a line that holds a non-ASCII character",
  "use Write to create a small node script that builds the character from " +
    "its number with `String.fromCodePoint`, instead of a backslash-u " +
    "escape typed into the script source",
  "confirm the result with a byte check",
  "print the offset and value of every byte above 0x7F",
  "The check passes when the edited line reads as the plan says and every " +
    "printed byte belongs to a character the plan keeps or writes.",
  "Run `gh api --slurp` without `--jq`",
];

const READ_CHEAP_WORKAROUNDS = [
  "Scope each search to the files a question names.",
  "Run Grep in files-with-matches or count mode first",
  "Run `gh api --slurp` without `--jq`",
  "filter its output in the same command by piping it into `node` or " +
    "`grep`, or narrow the request so it needs no filter.",
];

test("the cheap agents carry the tool-failure workarounds", async () => {
  const stageCheap = await agentText("stage-cheap");
  assertPhrases(stageCheap, STAGE_CHEAP_WORKAROUNDS, "stage-cheap.md");
  const readCheap = await agentText("read-cheap");
  assertPhrases(readCheap, READ_CHEAP_WORKAROUNDS, "read-cheap.md");
  assert.doesNotMatch(readCheap, prose("filter its output in a separate step"));
});
