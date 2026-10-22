import { fencedBlocks } from "./text.mjs";

// --- Scope and structure checks ---

export function checkExplicitScope(body) {
  const hasScope =
    /\bscope\b/i.test(body) || /\bone skill per\b/i.test(body) || /\bdo not (also |)trigger\b/i.test(body);
  return {
    id: "explicit-scope",
    label: "Explicit scope boundaries",
    value: hasScope ? "present" : "absent",
    pass: hasScope,
    detail: hasScope ? "scope markers found" : "no scope markers",
  };
}

const CAP_RE = /\bcap\b.*\b(delegat|dispatch|agent)/i;
const CAP_NUM_RE = /\bmax(imum|)\s+\d+\s+(sub)?agent/i;
const CAP_COLON_RE = /\bcap:\s*\d+/i;

export function checkDelegationCap(body) {
  const agents = (body.match(/\b(?:re)?dispatch(?:es|ed|ing)?\s+`/gi) ?? []).length;
  const hasCap = CAP_RE.test(body) || CAP_NUM_RE.test(body) || CAP_COLON_RE.test(body);
  return {
    id: "delegation-cap",
    label: "Subagent delegation capped (when dispatching)",
    value: agents,
    pass: agents === 0 || hasCap,
    detail: agents === 0 ? "no dispatches" : hasCap ? "cap found" : `${agents} dispatches, no cap`,
  };
}

function isScriptRef(blockLines) {
  return blockLines.some((l) => /\bnode\b.*\.mjs\b/.test(l) || /\$\{CLAUDE_PLUGIN_ROOT\}/.test(l));
}

const COMMAND_LANGS = new Set(["bash", "sh", "shell", "zsh", "cmd", "powershell"]);

export function checkWorkedExamples(body) {
  const hits = [];
  for (const block of fencedBlocks(body)) {
    const len = block.end - block.start;
    if (len > 15 && !isScriptRef(block.lines) && !COMMAND_LANGS.has(block.lang.toLowerCase())) {
      hits.push({ line: block.start, length: len });
    }
  }
  return {
    id: "no-constraining-examples",
    label: "No long worked examples (>15 lines, non-script)",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "none found" : hits.map((h) => `L${h.line}: ${h.length} lines`).join("; "),
  };
}

export function checkConsistentTerminology(body, kind) {
  const synonymSets = [
    ["subagent", "sub-agent", "sub agent"],
    ["frontmatter", "front-matter", "front matter"],
  ];
  if (kind === "skill") synonymSets.push(["SKILL.md", "skill.md", "Skill.md"]);
  const mixed = [];
  for (const set of synonymSets) {
    const found = set.filter((term) => body.includes(term));
    if (found.length > 1) mixed.push(found.join(" / "));
  }
  return {
    id: "consistent-terminology",
    label: "Consistent terminology (no synonym mixing)",
    value: mixed.length,
    pass: mixed.length === 0,
    detail: mixed.length === 0 ? "consistent" : `mixed: ${mixed.join(", ")}`,
  };
}
