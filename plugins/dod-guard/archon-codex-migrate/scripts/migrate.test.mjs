import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { commitAll, git, initRepo, scratch } from "../../archon-shared/scripts/testing.mjs";
import { atOrUnder } from "./common.mjs";
import { advance, approve, NONE, options, report, signalProblem } from "./migrate.mjs";

const AGENT = "---\nname: helper\ndescription: Helps.\nmodel: sonnet\ntools: Read\n---\n\nRead files and answer.\n";

function fixture(t) {
  const repo = initRepo(t, "migrate-");
  mkdirSync(join(repo, ".claude", "agents"), { recursive: true });
  writeFileSync(join(repo, "CLAUDE.md"), "# Rules\n\nAsk with AskUserQuestion before big changes.\n");
  writeFileSync(join(repo, "AGENTS.md"), "# Agents\n\nShared rules.\n");
  writeFileSync(join(repo, ".claude", "agents", "helper.md"), AGENT);
  commitAll(repo);
  return repo;
}

function propose(dir, slices, extra = {}) {
  writeFileSync(
    join(dir, "slices.json"),
    JSON.stringify({ test: "", agentSource: ".claude/agents", slices, ...extra }),
  );
  writeFileSync(join(dir, "proposal.md"), "Move the rules to AGENTS.md.\n");
}

const REWORD = {
  id: "s1",
  label: "Word the check-in by capability",
  kind: "reword",
  files: ["CLAUDE.md"],
  signals: ["AskUserQuestion"],
  plan: "say ask the user",
};
const REDUCE = {
  id: "s2",
  label: "Reduce CLAUDE.md to an import",
  kind: "reduce-claude",
  from: ["CLAUDE.md"],
  to: ["AGENTS.md"],
  plan: "move then import",
};
const AGENTS = { id: "s3", label: "Generate Codex agents", kind: "agents", plan: "run the converter" };

function start(t, slices, extra) {
  const repo = fixture(t);
  const dir = scratch(t, "migrate-");
  propose(dir, slices, extra);
  options({ dir, repo });
  return { repo, dir, base: { dir, repo } };
}

const state = (dir) => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));

test("the form offers valid slices and rejects hand-edited TOML and incomplete moves", (t) => {
  const dir = scratch(t, "migrate-");
  propose(dir, [
    REWORD,
    { id: "bad", label: "edit toml", kind: "reword", files: [".codex/agents/helper.toml"], signals: ["x"] },
    { id: "half", label: "half a move", kind: "move", from: ["CLAUDE.md"] },
    { id: NONE, label: "clash", kind: "agents" },
    { id: "gen-dir", label: "edit toml dir", kind: "reword", files: [".codex/agents"], signals: ["x"] },
  ]);
  const form = options({ dir, repo: dir });
  assert.deepEqual(
    form.options.map((option) => option.id),
    ["s1", NONE],
  );
  assert.equal(form.count, "1");
  const items = JSON.parse(readFileSync(join(dir, "items.json"), "utf8"));
  assert.deepEqual(
    items.rejected.map((entry) => entry.id),
    ["bad", "half", NONE, "gen-dir"],
  );
});

test("a reword that lowers its signals is committed; a second slice is queued after it", (t) => {
  const { repo, dir, base } = start(t, [REWORD, AGENTS]);
  approve({ ...base, answer: JSON.stringify({ decisions: ["s1", "s3"] }) });
  assert.equal(JSON.parse(readFileSync(join(dir, "current.json"), "utf8")).id, "s1");
  writeFileSync(join(repo, "CLAUDE.md"), "# Rules\n\nAsk the user before big changes.\n");
  assert.equal(advance(base), false);
  assert.equal(state(dir).results.s1.status, "applied");
  assert.equal(git(repo, ["log", "-1", "--format=%s"]), "codex-migrate: Word the check-in by capability");
  assert.equal(state(dir).current, "s3");
  // The agents slice needs no session edit: the converter writes the TOML.
  assert.equal(advance(base), true);
  assert.equal(state(dir).results.s3.status, "applied");
  assert.match(git(repo, ["ls-files", ".codex/agents"]), /helper\.toml$/);
  assert.equal(git(repo, ["status", "--porcelain"]), "");
});

test("a reword that leaves its signals is reverted and the next slice still runs", (t) => {
  const { repo, dir, base } = start(t, [REWORD, AGENTS]);
  approve({ ...base, answer: JSON.stringify({ decisions: ["s1", "s3"] }) });
  writeFileSync(join(repo, "CLAUDE.md"), "# Rules\n\nAlways ask with AskUserQuestion before big changes.\n");
  assert.equal(advance(base), false);
  assert.equal(state(dir).results.s1.status, "failed");
  assert.match(state(dir).results.s1.reason, /did not drop/);
  assert.match(readFileSync(join(repo, "CLAUDE.md"), "utf8"), /Ask with AskUserQuestion/);
  assert.equal(state(dir).current, "s3");
});

test("a change outside the slice or a hand commit fails the slice and is undone", (t) => {
  const { repo, dir, base } = start(t, [REWORD]);
  approve({ ...base, answer: JSON.stringify({ decisions: ["s1"] }) });
  writeFileSync(join(repo, "CLAUDE.md"), "# Rules\n\nAsk the user.\n");
  writeFileSync(join(repo, "notes.txt"), "stray\n");
  assert.equal(advance(base), true);
  assert.match(state(dir).results.s1.reason, /outside the slice: notes.txt/);
  assert.equal(existsSync(join(repo, "notes.txt")), false);

  const second = start(t, [REWORD]);
  approve({ ...second.base, answer: JSON.stringify({ decisions: ["s1"] }) });
  const before = git(second.repo, ["rev-parse", "HEAD"]);
  writeFileSync(join(second.repo, "CLAUDE.md"), "# Rules\n\nAsk the user.\n");
  git(second.repo, ["commit", "-qam", "by hand"]);
  advance(second.base);
  assert.match(state(second.dir).results.s1.reason, /made a commit/);
  assert.equal(git(second.repo, ["rev-parse", "HEAD"]), before);
});

test("a deleted CLAUDE.md fails the slice", (t) => {
  const { repo, dir, base } = start(t, [REDUCE]);
  approve({ ...base, answer: JSON.stringify({ decisions: ["s2"] }) });
  rmSync(join(repo, "CLAUDE.md"));
  advance(base);
  assert.match(state(dir).results.s2.reason, /deleted CLAUDE.md/);
  assert.ok(existsSync(join(repo, "CLAUDE.md")));
});

test("a CLAUDE.md reduction must balance the moved signals and leave the adapter canonical", (t) => {
  const { repo, dir, base } = start(t, [REDUCE]);
  approve({ ...base, answer: JSON.stringify({ decisions: ["s2"] }) });
  writeFileSync(
    join(repo, "AGENTS.md"),
    "# Agents\n\nShared rules.\n\n## Claude\n\nAsk with AskUserQuestion before big changes.\n",
  );
  writeFileSync(join(repo, "CLAUDE.md"), "@AGENTS.md\n");
  assert.equal(advance(base), true);
  assert.equal(state(dir).results.s2.status, "applied", state(dir).results.s2.reason);
});

test("the signal rules for a move catch lost signals and a non-canonical adapter", () => {
  const finding = (file, signal) => ({ category: "claude-only", file, line: 1, signal });
  const before = { claudeAdapter: "custom", findings: [finding("CLAUDE.md", "AskUserQuestion")] };
  const lost = { claudeAdapter: "canonical", findings: [] };
  assert.match(signalProblem(REDUCE, before, lost), /do not equal/);
  const custom = { claudeAdapter: "custom", findings: [finding("AGENTS.md", "AskUserQuestion")] };
  assert.match(signalProblem(REDUCE, before, custom), /not canonical/);
  const moved = { ...REDUCE, kind: "move" };
  assert.equal(signalProblem(moved, before, custom), null);
});

test("the signal rules count findings at or under a slice entry that names a directory", () => {
  const at = (file) => ({ findings: [{ category: "claude-only", file, line: 1, signal: "AskUserQuestion" }] });
  const agentFile = at(".claude/agents/helper.md");
  const reword = { kind: "reword", files: [".claude/agents"], signals: ["AskUserQuestion"] };
  assert.equal(signalProblem(reword, agentFile, { findings: [] }), null);
  const move = { kind: "move", files: [], from: [".claude/agents"], to: ["docs"], signals: [] };
  assert.equal(signalProblem(move, agentFile, at("docs/rules.md")), null);
});

test("Apply nothing records no slice, and the report names what went unobserved", (t) => {
  const { dir, base } = start(t, [REWORD]);
  approve({ ...base, answer: JSON.stringify({ decisions: [NONE, "s1"] }) });
  assert.equal(state(dir).current, null);
  const text = report({ dir });
  assert.match(text, /s1 Word the check-in by capability \(reword\): not approved/);
  assert.match(text, /Neither runtime was asked/);
  assert.match(text, /documents no test command/);
  assert.match(text, /Move the rules to AGENTS.md/);
});

test("a failing documented test command fails the slice", (t) => {
  const { repo, dir, base } = start(t, [REWORD], { test: "exit 3" });
  approve({ ...base, answer: JSON.stringify({ decisions: ["s1"] }) });
  writeFileSync(join(repo, "CLAUDE.md"), "# Rules\n\nAsk the user before big changes.\n");
  advance(base);
  assert.match(state(dir).results.s1.reason, /test command failed: exit 3/);
});

test("the form message, commit message, mismatch reason and report lines keep their exact text", (t) => {
  const { repo, dir, base } = start(t, [REWORD]);
  const form = options({ dir, repo });
  assert.equal(
    form.message,
    "Pick the slices to apply; they run back to back in this order. " +
      `The proposal is in ${join(dir, "proposal.md")}.\n\n` +
      "s1: Word the check-in by capability (reword)\n  files: CLAUDE.md\n  plan: say ask the user",
  );
  approve({ ...base, answer: JSON.stringify({ decisions: ["s1"] }) });
  writeFileSync(join(repo, "CLAUDE.md"), "# Rules\n\nAsk the user before big changes.\n");
  assert.equal(advance(base), true);
  assert.equal(
    git(repo, ["log", "-1", "--format=%B"]),
    "codex-migrate: Word the check-in by capability\n\n" +
      "Slice s1 (reword), applied and verified by the dod-guard\ncodex-migrate workflow.",
  );
  const finding = { category: "claude-only", file: "CLAUDE.md", line: 1, signal: "AskUserQuestion" };
  assert.equal(
    signalProblem(REDUCE, { findings: [finding] }, { claudeAdapter: "canonical", findings: [] }),
    "signals removed from CLAUDE.md (AskUserQuestion x1) do not equal those added to AGENTS.md (none)",
  );
  assert.ok(
    report({ dir }).includes(
      "\n- Neither runtime was asked to name its active instruction sources; " +
        "open Codex and Claude in this checkout to confirm.\n",
    ),
  );
});

test("the CLI prints one trailing newline and exits 2 with the migrate prefix on an error", (t) => {
  const script = fileURLToPath(new URL("./migrate.mjs", import.meta.url));
  const missing = spawnSync(process.execPath, [script, "report"], { encoding: "utf8" });
  assert.equal(missing.status, 2);
  assert.equal(missing.stderr, "migrate: missing --dir\n");
  const { dir } = start(t, [REWORD]);
  const printed = spawnSync(process.execPath, [script, "report", `--dir=${dir}`], { encoding: "utf8" });
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(printed.stdout, readFileSync(join(dir, "report.md"), "utf8"));
  const listed = spawnSync(process.execPath, [script, "options", `--dir=${dir}`], { encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout, `${JSON.stringify(options({ dir }))}\n`);
});

test("a reword of text the scanner does not flag is applied and reported as test-verified only", (t) => {
  const unflagged = { id: "s4", label: "Word research by capability", kind: "reword", files: ["AGENTS.md"], plan: "x" };
  const { repo, dir, base } = start(t, [unflagged]);
  approve({ ...base, answer: JSON.stringify({ decisions: ["s4"] }) });
  writeFileSync(join(repo, "AGENTS.md"), "# Agents\n\nShared rules, worded by capability.\n");
  assert.equal(advance(base), true);
  assert.equal(state(dir).results.s4.status, "applied");
  assert.match(report({ dir }), /s4 .*applied in \w+; the scanner flags none of this text/);
});

test("a path is at or under a directory named with or without a trailing slash, never a sibling prefix", () => {
  assert.equal(atOrUnder(".claude/agents", ".claude/agents/"), true);
  assert.equal(atOrUnder(".claude/agents/x.md", ".claude/agents/"), true);
  assert.equal(atOrUnder(".claude/agentsX/y.md", ".claude/agents"), false);
});

test("a reword that names the agent directory regenerates the Codex agents from its edit", (t) => {
  const agentDir = { id: "s5", label: "Word the helper by capability", kind: "reword", files: [".claude/agents"] };
  const { repo, dir, base } = start(t, [agentDir]);
  approve({ ...base, answer: JSON.stringify({ decisions: ["s5"] }) });
  writeFileSync(join(repo, ".claude", "agents", "helper.md"), AGENT.replace("Read files", "Inspect files"));
  assert.equal(advance(base), true);
  assert.equal(state(dir).results.s5.status, "applied", state(dir).results.s5.reason);
  const toml = git(repo, ["ls-files", ".codex/agents"])
    .split("\n")
    .find((path) => path.endsWith("helper.toml"));
  assert.ok(toml, "the slice commit carries no generated agent TOML");
  assert.match(git(repo, ["show", `HEAD:${toml}`]), /Inspect files and answer/);
  assert.equal(git(repo, ["status", "--porcelain"]), "");
});
