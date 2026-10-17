import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pluginRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("the project's Codex agent registry matches the shipped agents", async () => {
  const { checkAgentOutputs } = await import("../../codex-migrate/scripts/convert-claude-agents.mjs");
  const repositoryRoot = join(pluginRoot, "..", "..");
  assert.deepEqual(await checkAgentOutputs(join(pluginRoot, "agents"), join(repositoryRoot, ".codex", "agents")), []);
});
