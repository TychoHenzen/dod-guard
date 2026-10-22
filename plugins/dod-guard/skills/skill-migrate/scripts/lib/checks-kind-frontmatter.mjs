// --- Kind-specific checks ---
// memory-frontmatter runs for the memory kind alone; agent-tools runs for
// the agent kind alone.

const ALLOWED_METADATA_TYPES = new Set(["user", "feedback", "project", "reference"]);

function metadataTypeValue(rawFm) {
  const match = /^\s+type:\s*(\S+)/m.exec(rawFm);
  return match ? match[1].trim() : "";
}

function missingNameOrDescription(fm) {
  const name = fm.name || "";
  const description = fm.description || "";
  if (!name.trim()) return "missing name";
  if (!description.trim()) return "missing description";
  return null;
}

function metadataTypeProblem(rawFm) {
  const type = metadataTypeValue(rawFm);
  if (!type) return "missing metadata.type";
  if (!ALLOWED_METADATA_TYPES.has(type)) {
    return `metadata.type "${type}" not one of user, feedback, project, reference`;
  }
  return null;
}

function memoryFrontmatterProblem(fm, rawFm) {
  return missingNameOrDescription(fm) ?? metadataTypeProblem(rawFm);
}

export function checkMemoryFrontmatter(fm, rawFm) {
  const problem = memoryFrontmatterProblem(fm, rawFm);
  return {
    id: "memory-frontmatter",
    label: "Frontmatter: name, description, metadata.type in allowed set",
    value: problem ?? "ok",
    pass: !problem,
    detail: problem ?? "valid",
  };
}

// Omitting `tools` is the runtime's own inherit-all form, so an agent that
// means it says so with the dedicated `inheritAllTools: true` key. Without the
// key, a missing tools line is a forgotten allowlist and still fails.
function agentToolsOutcome(tools, inheritsAll) {
  if (tools && inheritsAll) {
    const detail = "contradiction: tools line with inheritAllTools: true";
    return { pass: false, value: tools, detail };
  }
  if (tools) return { pass: true, value: tools, detail: "tools declared" };
  if (inheritsAll) {
    const detail = "inherits every tool (inheritAllTools: true)";
    return { pass: true, value: "inherit-all", detail };
  }
  return { pass: false, value: "absent", detail: "no tools line" };
}

function trimmedValue(raw) {
  return (raw ?? "").trim();
}

export function checkAgentTools(fm) {
  const tools = trimmedValue(fm.tools);
  const inheritsAll = trimmedValue(fm.inheritAllTools) === "true";
  return {
    id: "agent-tools",
    label: "Frontmatter declares tools",
    ...agentToolsOutcome(tools, inheritsAll),
  };
}
