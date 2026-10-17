// Agent-file structure for the routing tiers, kept apart so
// model-routing.test.mjs stays within the file-size lint.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const pluginRoot = new URL("../../../", import.meta.url);

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
