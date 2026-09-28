import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skill = await readFile(join(scriptDir, "..", "SKILL.md"), "utf8");

test("blind-rewrite uses the current PBI and bounded-subagent workflow", async () => {
  await access(join(scriptDir, "overlap-scan.mjs"));
  for (const marker of [
    "one branch and one PR",
    "short-lived bounded collaboration",
    "active plugin directory",
    "Extract the contract",
    "Quarantine and delete",
    "Write blind",
    "Run the overlap gate",
    "Gap audit and handoff",
    "Allow at most two write/gate cycles",
    "[$dod-guard:codex-advisor](../codex-advisor/SKILL.md)",
  ]) {
    assert.ok(skill.includes(marker), `missing blind-rewrite marker: ${marker}`);
  }
  assert.doesNotMatch(skill, /OpenSpec|openspec|CLAUDE_PLUGIN_ROOT|5\.4\.\d+/i);
});
