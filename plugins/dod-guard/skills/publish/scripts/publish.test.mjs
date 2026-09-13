import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skillPath = new URL("../SKILL.md", import.meta.url);

test("publish skill classifies the complete tree before PBI routing", async () => {
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /Classify the complete pending tree before requiring a PBI or pull request/);
  assert.match(skill, /If any file is functional,\s+use the functional path for the whole release/);
  assert.match(skill, /For a `maintenance-only` release/);
  assert.match(skill, /For a `functional` release, invoke `\/submit-draft-pr`/);
});

test("publish scans pending content before commit", async () => {
  const skill = await readFile(skillPath, "utf8");
  const scan = skill.indexOf("inspect-repository.mjs");
  const commit = skill.indexOf("Use `/commit`'s staging and commit-message steps only");

  assert.ok(scan >= 0 && scan < commit);
  assert.match(skill, /Stop when `credentialFindings` is non-empty/);
  assert.match(skill, /Never print matched values/);
});

test("maintenance releases skip PBI and PR while restoring protection", async () => {
  const skill = await readFile(skillPath, "utf8");
  const defaults = await readFile(
    new URL("../../../standards/working-defaults.md", import.meta.url),
    "utf8",
  );

  assert.match(skill, /paired version-only bump made solely to invalidate the cache for\s+maintenance content remains `maintenance-only`/);
  assert.match(skill, /For a `maintenance-only` release:[\s\S]+Do not require or create a PBI, feature branch, or pull request/);
  assert.match(skill, /release commit's parent\s+to equal it/);
  assert.match(skill, /`allow_force_pushes\.enabled` to be true/);
  assert.match(skill, /--force-with-lease=refs\/heads\/master:<saved-sha>/);
  assert.match(skill, /lease rejects any intervening update/);
  assert.match(skill, /Never use an\s+unpinned force push/);
  assert.match(skill, /temporarily disable only\s+admin enforcement with\s+`gh api -X DELETE/);
  assert.match(skill, /branches\/master\/protection\/enforce_admins --silent/);
  assert.match(skill, /`--silent` avoids JSON parsing it/);
  assert.match(skill, /Read protection back even if the command reports an error[\s\S]+Proceed only\s+when `enforce_admins\.enabled` is false and every other saved setting is\s+unchanged/);
  assert.match(skill, /A force-push\s+allowance alone does not bypass the PR or check rules/);
  assert.match(skill, /In a `finally` step, restore[\s\S]+full\s+saved protection with/);
  assert.match(skill, /gh api -X POST repos\/{owner\}\/\{repo\}\/branches\/master\/protection\/enforce_admins --silent/);
  assert.match(skill, /retry `POST` once and read\s+it back again/);
  assert.match(skill, /Other users remain\s+subject to the\s+branch\s+rules/);
  assert.match(skill, /`\/commit`'s staging and commit-message steps only/);
  assert.match(skill, /Do not run its\s+ordinary push, sync, or pull-and-merge retry/);
  assert.doesNotMatch(skill, /If branch protection requires a pull request, stop/);
  assert.match(defaults, /The explicit `\/publish` maintenance-only route may[\s\S]+temporarily disable only admin enforcement/);
  assert.match(skill, /After a direct maintenance push or a merged functional release has green CI/);
});
