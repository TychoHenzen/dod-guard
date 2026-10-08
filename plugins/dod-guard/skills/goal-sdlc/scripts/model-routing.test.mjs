import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Codex ignores or caps spawn-time model overrides, so each tier is pinned in
// its agent file. These tests pin both the Claude source and the generated
// Codex registration.
const pluginRoot = new URL("../../../", import.meta.url);
const repositoryRoot = new URL("../../../../../", import.meta.url);

const TIER_AGENTS = [
  { name: "stage-strong", model: "opus", effort: "medium", codex: "gpt-5.6-sol", sandbox: "workspace-write" },
  { name: "stage-cheap", model: "haiku", effort: "max", codex: "gpt-5.6-luna", sandbox: "workspace-write" },
  { name: "read-strong", model: "opus", effort: "medium", codex: "gpt-5.6-sol", sandbox: "read-only" },
  { name: "read-cheap", model: "haiku", effort: "max", codex: "gpt-5.6-luna", sandbox: "read-only" },
];

function line(key, value, separator) {
  return new RegExp(`^${key}${separator}${value}$`, "m");
}

test("each tier agent pins its model and effort for Claude Code and Codex", async () => {
  for (const agent of TIER_AGENTS) {
    const source = await readFile(new URL(`agents/${agent.name}.md`, pluginRoot), "utf8");
    assert.match(source, line("model", agent.model, ": "), agent.name);
    assert.match(source, line("effort", agent.effort, ": "), agent.name);
    assert.ok(!source.includes("\r"), `${agent.name} must use LF line endings`);

    const tomlName = `dod_guard_${agent.name.replaceAll("-", "_")}.toml`;
    const toml = await readFile(new URL(`.codex/agents/${tomlName}`, repositoryRoot), "utf8");
    assert.match(toml, line("model", `"${agent.codex}"`, " = "), agent.name);
    assert.match(toml, line("model_reasoning_effort", `"${agent.effort}"`, " = "), agent.name);
    assert.match(toml, line("sandbox_mode", `"${agent.sandbox}"`, " = "), agent.name);
  }
});
