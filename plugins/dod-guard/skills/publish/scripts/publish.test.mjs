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

test("maintenance path preserves protection and skips PBI ceremony", async () => {
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /If branch protection requires a pull request, stop and report that exact\s+condition/);
  assert.match(skill, /Do not create a PBI, invoke `\/submit-draft-pr`, bypass protection,\s+or claim that the release completed/);
  assert.match(skill, /After a direct maintenance push or a merged functional release has green CI/);
});
