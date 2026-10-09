import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

// The triage rules live once in the standard, and complete-pr owns only the
// trigger. These tests pin both halves of that split.
const pluginRoot = new URL("../../../", import.meta.url);
const standard = await readFile(new URL("standards/conflict-triage.md", pluginRoot), "utf8");
const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

function assertPhrases(text, phrases) {
  for (const phrase of phrases) {
    assert.match(text, prose(phrase), phrase);
  }
}

test("complete-pr hands a merge conflict on the PBI head to the triage", () => {
  assertPhrases(skill, [
    "## Triage a merge conflict",
    "When the helper stops with `merge_conflict` on a pull request whose head is the trusted PBI head",
    "triage the conflict as `standards/conflict-triage.md` says instead of ending the run",
    "end with `conflict-triaged` and do not merge",
    "`/submit-draft-pr` convergence and `/review-pr` before this skill runs again",
    "or the conflict triage ends with `conflict-triaged` or a stop",
  ]);
});

test("the triage runs each stage at its routed tier", () => {
  assertPhrases(standard, [
    "that thread is the `dod-guard:stage-strong` stage worker",
    "**Plan** (strong tier, `dod-guard:read-strong`)",
    "**Investigate** (cheap tier, `dod-guard:read-cheap`). Only questions that need reads beyond the conflicted hunks go to investigators.",
    "**Judge** (strong tier, `dod-guard:read-strong`)",
    "**Apply** (cheap tier, `dod-guard:stage-cheap`)",
    "name the stage, tier, model, and effort in every progress message",
  ]);
});

test("the triage verifies before any push and stops without one", () => {
  assertPhrases(standard, [
    "`git merge --no-ff --no-commit`",
    "no conflict marker remains, `git diff --check` is clean, and every decision is visible in the staged result",
    "run the target repository's full validation set from its instructions",
    "under the stale-test rule in `standards/working-defaults.md`",
    "A second failure stops the run.",
    "- both sides change the same behavior and no intent source says which wins;",
    "- a path is modified on one side and deleted on the other;",
    "- a binary path conflicts;",
    "- a judged decision has no basis, or is `stop`;",
    "- the pull request head or base changes during the run.",
    "It runs `git merge --abort` only when `MERGE_HEAD` is this run's recorded base.",
    "Never run `git reset`, `git stash`, `git checkout --`, or a push to undo work.",
    "Report the paths, the reason, and the decision needed.",
    "The remote pull request head stays unchanged.",
  ]);
});

test("the triage proves provenance, records the run, and re-enters review", () => {
  assertPhrases(standard, [
    "The head must equal the trusted head and the base must equal the recorded base.",
    "exactly two parents: the trusted head, then the recorded base",
    "pushes without force as a fast-forward and reads the remote head back",
    "Add one `## Conflict triage` section",
    "the base SHA, the merge SHA, each path's decision and basis, the question ids, the investigator answers used, the verification results, and the stop reason",
    "Write no local ledger.",
    "re-enters `/submit-draft-pr` convergence on the new head, then `/review-pr`, and only then `/complete-pr`",
    "The triage posts no review request to Codex",
  ]);
});

test("the triage regenerates generated paths from declared generators only", () => {
  assertPhrases(standard, [
    "A path is generated only when the target repository's instructions declare its generator.",
    "Never infer a generator from a path name.",
    "A conflicted generated path is never hand-merged: its decision is `regenerate`.",
    "announces it is generated but matches no declared generator stops the run",
    "then run `regen-check`: every change must be a declared output",
    "run `regen-check --expect-clean`: the second run must change nothing",
  ]);
});
