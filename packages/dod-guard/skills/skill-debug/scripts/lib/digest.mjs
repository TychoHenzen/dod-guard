// One line per tool call. Every tool has one argument that says what the call
// was for, and dumping the rest buries it. A Bash call is its command. A Read
// is its path. An Agent dispatch is which agent and what for.
//
// The fallback prints the whole input, because an unrecognized tool is exactly
// the case where nobody knows yet which argument matters.

export const LIMIT = { tool: 110, result: 90, user: 400, say: 110 };

function agentDigest(input) {
  return `${input.subagent_type ?? "?"} - ${input.description ?? ""}`;
}

const DIGEST = {
  Bash: (input) => input.command,
  Read: (input) => input.file_path,
  Write: (input) => input.file_path,
  Edit: (input) => input.file_path,
  Glob: (input) => input.pattern,
  Grep: (input) => input.pattern,
  Skill: (input) => `${input.skill ?? ""} ${input.args ?? ""}`,
  Agent: agentDigest,
  Task: agentDigest,
};

export function shorten(text, limit) {
  const flat = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > limit ? `${flat.slice(0, limit)}...` : flat;
}

export function digest(name, input) {
  const pick = DIGEST[name];
  const raw = pick ? pick(input ?? {}) : JSON.stringify(input ?? {});
  return shorten(raw, LIMIT.tool);
}
