import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const skillsRoot = fileURLToPath(new URL("../../", import.meta.url));
const pluginRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillNames = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const skills = new Map(
  await Promise.all(skillNames.map(async (name) => [name, await readFile(join(skillsRoot, name, "SKILL.md"), "utf8")])),
);
const defaults = await readFile(join(pluginRoot, "standards", "working-defaults.md"), "utf8");

const exceptionRules = new Map([
  ["clean-house", [/local deletion exception/i, /exact items the user approves/i, /unrelated dirty changes/i]],
  [
    "publish",
    [
      /credential-like(?: files)?/i,
      /unrelated,?\s+or indistinguishable/i,
      /Stop when `credentialFindings` is non-empty/i,
    ],
  ],
  ["skill-migrate", [/only step that blocks on user input/i, /Proceed only\s+after the user responds/i]],
  [
    "doc-reconcile",
    [
      /Exclude uncommitted files from automatic dating and\s+deletion/i,
      /Do not commit, stash, reset, or overwrite user work/i,
    ],
  ],
]);

test("every shipped skill applies the shared working defaults", () => {
  assert.equal(skillNames.length, 23);
  for (const [name, skill] of skills) {
    assert.match(skill, /standards\/working-defaults\.md/, name);
  }
});

test("skills load the shared standards in one line instead of a preamble section", () => {
  const githubFacing = new Set([
    "add-backlog-idea",
    "blind-rewrite",
    "complete-pr",
    "fix-pr-review",
    "goal-sdlc",
    "next-ticket",
    "publish",
    "quick-pbi",
    "refine-backlog-item",
    "review-pr",
    "setup-repository",
    "submit-draft-pr",
  ]);
  for (const [name, skill] of skills) {
    assert.doesNotMatch(skill, /^## Shared working defaults$|Before GitHub calls, read/m, name);
    if (githubFacing.has(name)) assert.match(skill, /standards\/github-request-discipline\.md/, name);
  }
});

test("delivery skills defer repository and Project resolution to the GitHub standard", () => {
  for (const name of ["add-backlog-idea", "refine-backlog-item", "next-ticket", "submit-draft-pr"]) {
    assert.match(
      skills.get(name),
      /"Resolve the repository and\s+Project" in\s+`standards\/github-request-discipline\.md`/,
      name,
    );
    assert.doesNotMatch(skills.get(name), /Do not pick\s+one by name|administrator must link/, name);
  }
});

test("policy fixtures cover decisive choices, dirty state, stale tests, and safety", () => {
  for (const signal of [
    /obvious low-risk option/,
    /dirty worktree/,
    /stale expectation/,
    /Never\s+weaken\s+or\s+delete a test/,
    /explicit user approval/,
    /unverified success/,
    /preserve the original checkpoint/,
    /Retry an identical transient failure at most\s+once/,
    /Read back remote state\s+after an uncertain write/,
    /confirmed blocker must use\s+`\/codex-advisor`: Claude's advisor tool in Claude Code/,
    /otherwise Codex with\s+`gpt-5\.6-luna` at `max` effort/,
  ]) {
    assert.match(defaults, signal);
  }
});

test("delivery skills inspect pending state before their mutations", () => {
  for (const name of [
    "complete-pr",
    "fix-pr-review",
    "clean-house",
    "next-ticket",
    "publish",
    "setup-repository",
    "submit-draft-pr",
  ]) {
    assert.match(skills.get(name), /dirty|pending/i, name);
  }
  for (const [name, staging] of [
    ["complete-pr", /stage only those reviewed paths, commit them on this verified branch/],
    ["fix-pr-review", /Stage only\s+reviewed files, create a concise commit/],
    ["next-ticket", /stage and commit them there with the ticket's other reviewed\s+changes/],
    ["submit-draft-pr", /stage only those\s+reviewed paths, commit them on the verified PBI branch/],
  ]) {
    assert.doesNotMatch(skills.get(name), /`\/commit`/, name);
    assert.match(skills.get(name), staging, name);
  }
});

test("branching and local mutation exceptions are explicit", () => {
  assert.match(defaults, /keep those changes[\s\S]*target branch/);
  assert.match(defaults, /Before selecting a delivery checkout, run `git worktree list --porcelain`/);
  assert.match(defaults, /first worktree as the main checkout/);
  assert.match(defaults, /stop and report\s+the reason, affected checkout, and recovery path\./);
  assert.match(defaults, /Never create, switch to, or\s+remove a Git worktree/);
  assert.doesNotMatch(defaults, /isolated worktree/);
  assert.doesNotMatch(skills.get("next-ticket"), /use one isolated worktree/);
  assert.match(defaults, /maintenance-only\s+`\/publish` route stays in the existing primary checkout/);
  assert.match(skills.get("next-ticket"), /Do not commit them on the current or default branch/);
  assert.match(skills.get("next-ticket"), /main checkout as the source of truth for ordinary ticket\s+work/);
  assert.match(skills.get("next-ticket"), /Before selection, run `git worktree list --porcelain`/);
  for (const [name, signals] of exceptionRules) {
    for (const signal of signals) assert.match(skills.get(name), signal, `${name}: ${signal}`);
  }
});

test("main checkout exceptions preserve user work and release isolation", () => {
  assert.match(defaults, /Never\s+reset,\s+stash, overwrite, move, or silently include user-owned changes/);
  assert.match(
    defaults,
    /maintenance-only\s+`\/publish` route stays in the existing primary checkout[\s\S]*Stop and preserve/,
  );
  assert.match(
    skills.get("next-ticket"),
    /locked, unavailable, active, or unsafe\s+user-owned main checkout, stop and report/,
  );
  assert.match(
    skills.get("next-ticket"),
    /Never reset, stash, overwrite,\s+move, or silently include user-owned changes/,
  );
});

test("implementation and review repair retain functional-style guidance", () => {
  for (const name of ["next-ticket", "fix-pr-review"]) {
    assert.match(skills.get(name), /small pure functions/);
    assert.match(skills.get(name), /ordinary loops or mutation/);
  }
});

test("local safety exceptions remain explicit", () => {
  assert.match(skills.get("clean-house"), /approval[\s\S]*delete/);
  assert.match(skills.get("review-pr"), /Never edit files, approve, mark ready, merge,\s+or close anything/);
  assert.match(skills.get("codex-migrate"), /Stop until the user answers/);
  assert.match(skills.get("complete-pr"), /explicit acceptance/);
});

// Retired workflows and deleted agents vanished once before while skills still named them.
test("shipped guidance names only skills and agents that ship", async () => {
  const agentNames = new Set((await readdir(join(pluginRoot, "agents"))).map((file) => file.replace(/\.md$/u, "")));
  const standards = await Promise.all(
    (await readdir(join(pluginRoot, "standards"))).map((file) => readFile(join(pluginRoot, "standards", file), "utf8")),
  );
  const agents = await Promise.all(
    [...agentNames].map((name) => readFile(join(pluginRoot, "agents", `${name}.md`), "utf8")),
  );
  for (const text of [...skills.values(), ...standards, ...agents]) {
    assert.doesNotMatch(text, /`\/commit`|\/interview\b|\$debate|adversarial-workflow|\$dod-guard:/u);
    for (const [, name] of text.matchAll(/dod-guard:([a-z0-9-]+)/gu)) {
      assert.ok(skills.has(name) || agentNames.has(name), `dod-guard:${name} names no shipped skill or agent`);
    }
  }
});

test("the project's Codex agent registry matches the shipped agents", async () => {
  const { checkAgentOutputs } = await import("../../codex-migrate/scripts/convert-claude-agents.mjs");
  const repositoryRoot = join(pluginRoot, "..", "..");
  assert.deepEqual(await checkAgentOutputs(join(pluginRoot, "agents"), join(repositoryRoot, ".codex", "agents")), []);
});
