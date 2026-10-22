// --- Kind detection ---
// The kind decides which checks run and which weight table scores them.
// `text` is unused today, kept so a later kind-specific check (memory
// frontmatter, agent tools) can inspect content without changing the
// signature.

function kindFromBasename(basename) {
  if (basename === "SKILL.md") return "skill";
  if (basename === "CLAUDE.md") return "claude-md";
  if (basename === "INSTINCTS.md") return "instinct";
  if (basename === "MEMORY.md") return "memory";
  return null;
}

function kindFromSegments(segments) {
  if (segments.includes("instincts")) return "instinct";
  if (segments.includes("memory")) return "memory";
  if (segments.includes("agents")) return "agent";
  return null;
}

export function detectKind(path, text) {
  void text;
  const segments = path.replace(/\\/g, "/").split("/");
  const basename = segments[segments.length - 1];
  return kindFromBasename(basename) ?? kindFromSegments(segments) ?? "skill";
}

// Each kind has its own line-count comfort zone. A skill's targets are
// unchanged from the pre-kind version, so a skill's score does not move.
export const LINE_COUNT_TARGETS = {
  skill: { warn: 300, fail: 500 },
  agent: { warn: 200, fail: 400 },
  "claude-md": { warn: 400, fail: 800 },
  memory: { warn: 40, fail: 100 },
  instinct: { warn: 20, fail: 60 },
};
