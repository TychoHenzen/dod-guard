// Shared by the model-routing test files. The name does not match the test
// glob, so the runner does not treat it as a suite.

// Codex ignores or caps spawn-time model overrides, so each tier is pinned in
// its agent file. The tests pin both the Claude source and the generated
// Codex registration.
export const pluginRoot = new URL("../../../", import.meta.url);
export const repositoryRoot = new URL("../../../../../", import.meta.url);

// Each agent's frontmatter is the single source for its Claude Code effort and
// for its Codex effort (`codex_effort`, falling back to `effort`). The model
// tier and Codex model are fixed here; the efforts are read, not repeated.
export const TIER_AGENTS = [
  {
    name: "stage-standard",
    model: "sonnet",
    codex: "gpt-5.6-terra",
    codexEffort: "medium",
    sandbox: "workspace-write",
  },
  {
    name: "stage-cheap",
    model: "haiku",
    codex: "gpt-5.6-luna",
    codexEffort: "max",
    sandbox: "workspace-write",
  },
  {
    name: "stage-cheap-skill",
    model: "haiku",
    codex: "gpt-5.6-luna",
    codexEffort: "max",
    sandbox: "workspace-write",
  },
  {
    name: "read-standard",
    model: "sonnet",
    codex: "gpt-5.6-terra",
    codexEffort: "medium",
    sandbox: "read-only",
  },
  {
    name: "read-cheap",
    model: "haiku",
    codex: "gpt-5.6-luna",
    codexEffort: "max",
    sandbox: "read-only",
  },
];

export function line(key, value, separator) {
  return new RegExp(`^${key}${separator}${value}$`, "m");
}

export function frontmatterValue(source, key) {
  const match = source.match(new RegExp(`^${key}: (.+)$`, "m"));
  return match ? match[1].trim() : undefined;
}
