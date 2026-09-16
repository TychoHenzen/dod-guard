import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const learner = await readFile("plugins/dod-guard/skills/learn-repository/SKILL.md", "utf8");
const teachBack = await readFile("plugins/dod-guard/skills/teach-back/SKILL.md", "utf8");
const readme = await readFile("plugins/dod-guard/README.md", "utf8");
const usage = await readFile("plugins/dod-guard/USAGE.md", "utf8");
const marketplace = await readFile(".claude-plugin/marketplace.json", "utf8");
const claudeManifest = await readFile("plugins/dod-guard/.claude-plugin/plugin.json", "utf8");
const codexManifest = await readFile("plugins/dod-guard/.codex-plugin/plugin.json", "utf8");

test("paired learning skills preserve their role and evidence contracts", () => {
  for (const skill of [learner, teachBack]) {
    assert.match(skill, /standards\/working-defaults\.md/);
    assert.match(skill, /current (?:repository|source|files)/i);
    assert.match(skill, /observed facts|inferences|unknown/i);
    assert.match(skill, /never (?:edits|execute|fabricate)/i);
  }
  assert.match(learner, /one small concept/i);
  assert.match(learner, /related topics/i);
  assert.match(learner, /restatement|trace|prediction|example/i);
  assert.match(learner, /\/teach-back/);
  assert.match(teachBack, /one question at a time/i);
  assert.match(teachBack, /why and how/i);
  assert.match(teachBack, /3 to 5 turns/i);
  assert.match(teachBack, /misunderstanding/i);
  assert.match(teachBack, /\/learn-repository/);
});

test("README, usage, and manifests expose both entry points", () => {
  for (const document of [readme, usage]) {
    assert.match(document, /\/learn-repository/);
    assert.match(document, /\/teach-back/);
  }
  for (const manifest of [marketplace, claudeManifest, codexManifest]) {
    assert.match(manifest, /20 skills/);
  }
});
