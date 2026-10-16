// The escalation, verification, and agent-name contracts of the routing
// standard, kept apart so model-routing.test.mjs stays within the file-size
// lint.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const pluginRoot = new URL("../../../", import.meta.url);
const repositoryRoot = new URL("../../../../../", import.meta.url);
const STANDARD = new URL("standards/model-routing.md", pluginRoot);
const standard = await readFile(STANDARD, "utf8");

function assertPhrases(text, phrases) {
  for (const phrase of phrases) {
    assert.match(text, prose(phrase), phrase);
  }
}

// The strong tier is reached only by escalation, so it has no agent of its
// own, and no Claude Code tier agent runs at effort max.
const TIER_AGENT = /^(stage|read)-(standard|cheap)\.md$/;
const NO_STRONG_TITLE = "the strong tier has no agent and no tier agent is max";

test(NO_STRONG_TITLE, async () => {
  const files = await readdir(new URL("agents/", pluginRoot));
  for (const kind of ["stage", "read"]) {
    assert.ok(!files.includes(`${kind}-strong.md`), `${kind}-strong exists`);
  }
  const tierFiles = files.filter((file) => TIER_AGENT.test(file));
  assert.equal(tierFiles.length, 4, "the four tier agents");
  for (const file of tierFiles) {
    const url = new URL(`agents/${file}`, pluginRoot);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /^effort: max$/m, `${file} Claude effort`);
  }
});

test("the four review lens agents default to the standard tier", async () => {
  for (const lens of ["feature", "design", "reliability", "hygiene"]) {
    const url = new URL(`agents/review-pr-${lens}.md`, pluginRoot);
    assert.match(await readFile(url, "utf8"), /^model: sonnet$/m, lens);
  }
});

const ESCALATION = [
  "The strong tier is a recovery path. A stage never starts on it",
  "one rung at a time. Each stage climbs a given rung at most once.",
  "Send the stage back once at the same tier with the exact gap.",
  "Before the strong rung only, ask `/codex-advisor` one question",
  "The cheap-to-standard rung and the rerun of a read-only review batch",
  "skip this step.",
  "already has this send-back: its one fresh bounded repair task.",
  "Run the stage again one rung up, with the failure record in the brief",
  "A failure on the strong rung stops the parent as a blocker",
  "a security, authority, credential, provider, head-mismatch, destructive,",
  "or missing-evidence stop",
  "The escalating thread never changes its own model.",
  "the owner, already a standard-tier thread that holds the plan and the",
  "failure record, carries out the task itself",
  "with `model: opus` and the strong effort",
  "A cheap-model skill-capable stage, which runs on `dod-guard:stage-cheap-skill`,",
  "never carries out a failed row itself.",
  "It stops and reports the failure record to its dispatcher",
  "A failure on the opus run stops the stage as a blocker.",
  "Dispatching a read-only row one rung up is not carrying out a failed row.",
  "so the dispatcher does not rerun the review stage on sonnet or opus.",
  "The failed-check rule above, the investigator-batch rule in",
  "and the repair rule in `dod-guard:step-by-step` escalate once and then",
  "a step whose repair fails climbs one rung under this section",
  "instead of stopping",
  "Malformed judge output, a refused merge pass, and the verification stop",
  "in `standards/conflict-triage.md` stay stops",
  "append it to that day's friction log as an occurrence",
];

test("the standard defines the escalation ladder", () => {
  assertPhrases(standard, ESCALATION);
});

// Each tier has its own verification rule: cheap output gets the per-answer
// check, standard and strong output get the readback and the named proof.
const TIER_VERIFICATION = [
  "## Verify cheap-tier output",
  "## Verify standard-tier and strong-tier output",
  "A standard worker returns judgements, not citations, so the per-answer",
  "check above does not apply.",
  "every commit the stage reports exists, is pushed, and matches the diff",
  "the stage's own named proof passes, and was run at the accepted head",
  "a stage that implements tasks reports, for each task, its dispatch (agent,",
  "model, and effort) or the escalation record that explains an edit by the",
  "owner. A missing report is a failed check, and the main thread logs it in the",
  "friction log.",
];

test("each tier has a stated verification rule", () => {
  assertPhrases(standard, TIER_VERIFICATION);
});

// A renamed or removed agent breaks every brief that still names it, so every
// tier agent a skill or standard dispatches by name must exist as a file, and
// every registered Codex name must exist in .codex/agents.
async function namesIn(directory, extension) {
  const files = await readdir(directory);
  const matching = files.filter((file) => file.endsWith(extension));
  const trim = -extension.length;
  return new Set(matching.map((file) => file.slice(0, trim)));
}

async function textsThatNameAgents() {
  const skillsRoot = new URL("skills/", pluginRoot);
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills = entries.filter((entry) => entry.isDirectory());
  const standards = ["model-routing.md", "conflict-triage.md"];
  return Promise.all([
    ...skills.map((entry) => {
      return readFile(new URL(`${entry.name}/SKILL.md`, skillsRoot), "utf8");
    }),
    ...standards.map((file) => {
      return readFile(new URL(`standards/${file}`, pluginRoot), "utf8");
    }),
  ]);
}

const AGENT_REFERENCE = /dod-guard:((?:stage|read)(?:-[a-z]+)+)/g;
const CODEX_REFERENCE = /`(dod_guard_(?:stage|read)(?:_[a-z]+)+)`/g;
const NAMES_TITLE = "every tier agent a skill or standard names exists";

test(NAMES_TITLE, async () => {
  const agentNames = await namesIn(new URL("agents/", pluginRoot), ".md");
  const codexDirectory = new URL(".codex/agents/", repositoryRoot);
  const codexNames = await namesIn(codexDirectory, ".toml");
  for (const text of await textsThatNameAgents()) {
    for (const [, name] of text.matchAll(AGENT_REFERENCE)) {
      assert.ok(agentNames.has(name), `dod-guard:${name} is not an agent file`);
    }
    for (const [, name] of text.matchAll(CODEX_REFERENCE)) {
      assert.ok(codexNames.has(name), `${name} is not a Codex agent`);
    }
  }
});

const OWNER_PRINCIPLE = [
  "The owner's principle decides every tier: haiku for anything that needs a lot",
  "of effort but low intelligence, sonnet only for tasks that need the added",
  "intelligence, and opus only when sonnet or haiku cannot figure it out.",
  "such as drafting a pull request from a handoff or the guarded merge.",
  "A rerun of a row takes that row's tier.",
  "so it does not fall back to the standard tier.",
  "`dod-guard:stage-cheap-skill` for an owner whose tier is cheap",
];

test("the tiers follow the owner principle and a rerun keeps its tier", () => {
  assertPhrases(standard, OWNER_PRINCIPLE);
  const start = standard.indexOf("## Tiers");
  const tiers = standard.slice(start, standard.indexOf("## Applying a tier"));
  assert.doesNotMatch(tiers, prose("It is for judgement with modest reasoning effort"));
  assert.doesNotMatch(tiers, prose("owning a stage, drafting a pull request, remediation"));
});

test("stage-standard describes itself as the skill-capable worker for the standard and strong tiers", async () => {
  const source = await readFile(new URL("agents/stage-standard.md", pluginRoot), "utf8");
  assertPhrases(source, [
    "It is the skill-capable worker for the standard and strong tiers: the dispatcher passes the strong",
    "tier's model and effort on the Agent call.",
    "stop and report the failure record to your dispatcher instead of carrying the row out",
  ]);
  assert.doesNotMatch(source, prose("judgement-heavy"));
  assert.doesNotMatch(source, prose("drafting a pull request"));
});

test("stage-cheap-skill describes itself as the skill-capable worker for the cheap tier", async () => {
  const source = await readFile(new URL("agents/stage-cheap-skill.md", pluginRoot), "utf8");
  assertPhrases(source, [
    "Carry out one cheap-tier lifecycle stage that needs a skill or a GitHub write",
    "stop and report the failure record to your dispatcher instead of carrying the row out",
  ]);
  assert.doesNotMatch(source, prose("judgement-heavy"));
});
