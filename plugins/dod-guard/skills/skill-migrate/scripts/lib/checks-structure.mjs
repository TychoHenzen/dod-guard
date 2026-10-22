import { hitsDetail } from "./check-result.mjs";
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

const CAP_PATTERNS = [/\bcap\b.*\b(delegat|dispatch|agent)/i, /\bmax(imum|)\s+\d+\s+(sub)?agent/i, /\bcap:\s*\d+/i];
const DISPATCH_RE = /\b(?:re)?dispatch(?:es|ed|ing)?\s+`/gi;
const hasDelegationCap = (body) => CAP_PATTERNS.some((re) => re.test(body));

function delegationDetail(agents, hasCap) {
  if (agents === 0) return "no dispatches";
  return hasCap ? "cap found" : `${agents} dispatches, no cap`;
}

export function checkDelegationCap(body) {
  const agents = (body.match(DISPATCH_RE) ?? []).length;
  const hasCap = hasDelegationCap(body);
  return {
    id: "delegation-cap",
    label: "Subagent delegation capped (when dispatching)",
    value: agents,
    pass: agents === 0 || hasCap,
    detail: delegationDetail(agents, hasCap),
  };
}

const MAX_EXAMPLE_LINES = 15;
const COMMAND_LANGS = new Set(["bash", "sh", "shell", "zsh", "cmd", "powershell"]);
const isScriptRef = (lines) => lines.some((l) => /\bnode\b.*\.mjs\b/.test(l) || /\$\{CLAUDE_PLUGIN_ROOT\}/.test(l));

function isWorkedExample(block) {
  const long = block.end - block.start > MAX_EXAMPLE_LINES;
  return long && !isScriptRef(block.lines) && !COMMAND_LANGS.has(block.lang.toLowerCase());
}

export function checkWorkedExamples(body) {
  const hits = fencedBlocks(body)
    .filter(isWorkedExample)
    .map((b) => ({ line: b.start, length: b.end - b.start }));
  return {
    id: "no-constraining-examples",
    label: "No long worked examples (>15 lines, non-script)",
    value: hits.length,
    pass: hits.length === 0,
    detail: hitsDetail(hits, { none: "none found", describe: (h) => `L${h.line}: ${h.length} lines` }),
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
