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
  await Promise.all(
    skillNames.map(async (name) => [
      name,
      await readFile(join(skillsRoot, name, "SKILL.md"), "utf8"),
    ]),
  ),
);
const defaults = await readFile(join(pluginRoot, "standards", "working-defaults.md"), "utf8");

const exceptionRules = new Map([
  ["clean-house", [
    /local deletion exception/i,
    /exact items the user approves/i,
    /unrelated dirty changes/i,
  ]],
  ["publish", [
    /credential-like files/i,
    /unrelated or indistinguishable work/i,
    /stop before `\/commit`/i,
  ]],
  ["skill-migrate", [
    /only step that blocks on user input/i,
    /Proceed only\s+after the user responds/i,
  ]],
  ["doc-reconcile", [
    /Exclude uncommitted files from automatic dating and\s+deletion/i,
    /Do not commit, stash, reset, or overwrite user work/i,
  ]],
]);

test("every shipped skill applies the shared working defaults", () => {
  assert.equal(skillNames.length, 16);
  for (const [name, skill] of skills) {
    assert.match(skill, /standards\/working-defaults\.md/, name);
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
  ]) {
    assert.match(defaults, signal);
  }
});

test("delivery skills inspect dirty worktrees before their mutations", () => {
  for (const name of [
    "complete-pr",
    "fix-pr-review",
    "clean-house",
    "next-ticket",
    "publish",
    "setup-repository",
    "submit-draft-pr",
  ]) {
    assert.match(skills.get(name), /dirty/i, name);
  }
  for (const name of ["complete-pr", "fix-pr-review", "next-ticket", "submit-draft-pr"]) {
    assert.match(skills.get(name), /`\/commit`/, name);
  }
});

test("branching and local mutation exceptions are explicit", () => {
  assert.match(defaults, /keep those changes[\s\S]*target branch/);
  assert.match(skills.get("next-ticket"), /Do not commit them on the current or default branch/);
  for (const [name, signals] of exceptionRules) {
    for (const signal of signals) assert.match(skills.get(name), signal, `${name}: ${signal}`);
  }
});

test("implementation and review repair retain functional-style guidance", () => {
  for (const name of ["next-ticket", "fix-pr-review"]) {
    assert.match(skills.get(name), /small pure functions/);
    assert.match(skills.get(name), /ordinary loops or mutation/);
  }
});

test("local safety exceptions remain explicit", () => {
  assert.match(skills.get("clean-house"), /approval[\s\S]*delete/);
  assert.match(skills.get("review-pr"), /Never switch branches, edit the target/);
  assert.match(skills.get("codex-migrate"), /Stop until the user answers/);
  assert.match(skills.get("complete-pr"), /explicit acceptance/);
});
