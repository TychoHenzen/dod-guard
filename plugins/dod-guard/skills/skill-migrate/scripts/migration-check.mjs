#!/usr/bin/env node
// Score a SKILL.md against post-4.6 migration guidelines.
// Each check carries a 0-1 score and a weight; the weighted sum is a
// 0-100 "5.0-readiness" score for comparing two skills.
// Exit codes: 0 all checks pass, 1 at least one fails, 3 usage error.
// With --json, writes structured output. With --before=<path>, loads a
// prior run and prints a before/after comparison.

import { readFileSync, writeFileSync } from "node:fs";

const USAGE = [
  "Usage: node migration-check.mjs <path-to-file> [options]",
  "",
  "  --json             Output structured JSON (score + checks)",
  "  --save=<path>      Write results to file (for before/after comparison)",
  "  --before=<path>    Load a prior run and compare against it",
  "  --kind=<k>         Override kind detection: skill, agent, claude-md, memory, instinct",
  "",
  "Prints a 0-100 5.0-readiness score (weighted sum of per-check scores).",
  "Exit codes: 0 pass, 1 at least one check fails, 3 usage error.",
].join("\n");

// --- Frontmatter parsing ---

function parseFrontmatterLine(fm, line, current) {
  const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line);
  if (kv) return { key: kv[1], val: kv[2].trim() };
  if (current && /^\s+/.test(line)) return { key: current, val: `${fm[current]} ${line.trim()}` };
  return null;
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const fm = {};
  let current = null;
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = parseFrontmatterLine(fm, line, current);
    if (!parsed) continue;
    current = parsed.key;
    fm[parsed.key] = parsed.val;
  }
  return fm;
}

function bodyAfterFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  return match ? match[1] : text;
}

// The frontmatter parser above flattens an indented continuation line onto
// its parent key, so a nested block like `metadata:\n  type: user` never
// becomes a nested object. Kind-specific checks that need a nested value
// read it back out of the raw frontmatter text instead.

function rawFrontmatterText(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return match ? match[1] : "";
}

function cleanDescription(fm) {
  return (fm.description ?? "").replace(/^>-?\s*/, "").trim();
}

// --- Shared line iterator (skips code fences) ---

function proseLines(body) {
  const raw = body.split(/\r?\n/);
  const result = [];
  let inFence = false;
  for (let i = 0; i < raw.length; i++) {
    if (/^\s*```/.test(raw[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) result.push({ text: raw[i], line: i + 1 });
  }
  return result;
}

function scanPatterns(body, patterns) {
  const hits = [];
  for (const { text, line } of proseLines(body)) {
    for (const { pattern, name } of patterns) {
      if (pattern.test(text)) {
        hits.push({ name, line, text: text.trim().slice(0, 60) });
      }
    }
  }
  return hits;
}

// --- Fenced block scanner (for worked-example detection) ---

function fencedBlocks(body) {
  const raw = body.split(/\r?\n/);
  const blocks = [];
  let start = -1;
  let lang = "";
  for (let i = 0; i < raw.length; i++) {
    const fence = /^\s*```(\w*)/.exec(raw[i]);
    if (!fence) continue;
    if (start < 0) {
      start = i + 1;
      lang = fence[1];
    } else {
      blocks.push({ start, end: i, lang, lines: raw.slice(start, i) });
      start = -1;
    }
  }
  return blocks;
}

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

function detectKind(path, text) {
  void text;
  const segments = path.replace(/\\/g, "/").split("/");
  const basename = segments[segments.length - 1];
  return kindFromBasename(basename) ?? kindFromSegments(segments) ?? "skill";
}

// --- Individual checks ---

// Each kind has its own line-count comfort zone. A skill's targets are
// unchanged from the pre-kind version, so a skill's score does not move.
const LINE_COUNT_TARGETS = {
  skill: { warn: 300, fail: 500 },
  agent: { warn: 200, fail: 400 },
  "claude-md": { warn: 400, fail: 800 },
  memory: { warn: 40, fail: 100 },
  instinct: { warn: 20, fail: 60 },
};

function checkLineCount(body, targets) {
  const lines = body.split(/\r?\n/).length;
  const { warn, fail } = targets;
  return {
    id: "line-count",
    label: `Body under ${fail} lines (target ${warn})`,
    value: lines,
    pass: lines <= fail,
    warn: lines > warn,
    detail: lines <= warn ? "within target" : lines <= fail ? "over target, under limit" : "over limit",
    targets,
  };
}

function nameProblems(name) {
  const problems = [];
  if (!/^[a-z0-9-]{1,64}$/.test(name)) problems.push("bad format");
  if (/\b(anthropic|claude)\b/i.test(name)) problems.push("reserved word");
  return problems;
}

function checkNameFormat(fm) {
  const name = fm.name ?? "";
  const problems = nameProblems(name);
  return {
    id: "name-format",
    label: "Name: lowercase, hyphens, 1-64 chars, no reserved words",
    value: name,
    pass: problems.length === 0,
    detail: problems.length === 0 ? "valid" : `"${name}": ${problems.join(", ")}`,
  };
}

function descriptionDetail(len, hasXml) {
  if (len === 0) return "empty";
  if (len > 1024) return `${len} chars, over 1024`;
  if (hasXml) return "contains XML tags";
  return `${len} chars`;
}

function checkDescriptionPresent(fm) {
  const desc = cleanDescription(fm);
  const hasXml = /<[a-z][\w-]*>/i.test(desc);
  return {
    id: "description-present",
    label: "Description: non-empty, under 1024 chars, no XML",
    value: desc.length,
    pass: desc.length > 0 && desc.length <= 1024 && !hasXml,
    detail: descriptionDetail(desc.length, hasXml),
  };
}

function checkDescriptionPerson(fm) {
  const desc = cleanDescription(fm);
  const bad = /^(I |We |You |My |Our |Your )/i.test(desc);
  return {
    id: "description-person",
    label: "Description in third person",
    value: bad ? desc.slice(0, 40) : "ok",
    pass: !bad,
    detail: bad ? "starts with first/second person" : "third person",
  };
}

const TRIGGER_RE = /\b(trigger|use (this |it |)when|when (the |a |)user|when asked|for use when)\b/i;

function checkDescriptionTriggers(fm) {
  const desc = cleanDescription(fm);
  const has = TRIGGER_RE.test(desc);
  return {
    id: "description-triggers",
    label: "Description says when to use (dispatcher routing)",
    value: has ? "present" : "absent",
    pass: has,
    detail: has ? "trigger language found" : "no when-to-use language",
  };
}

function isAtImport(line) {
  return /^\s*@[\w./-]+/.test(line) && !/```/.test(line) && !/^\s*#/.test(line);
}

function checkNoAtImports(body) {
  const hits = body.split(/\r?\n/).filter(isAtImport).map((l) => l.trim());
  return {
    id: "no-at-imports",
    label: "No @-imports in SKILL.md",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "none found" : `found: ${hits.slice(0, 3).join(", ")}`,
  };
}

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

function checkMemoryFrontmatter(fm, rawFm) {
  const problem = memoryFrontmatterProblem(fm, rawFm);
  return {
    id: "memory-frontmatter",
    label: "Frontmatter: name, description, metadata.type in allowed set",
    value: problem ?? "ok",
    pass: !problem,
    detail: problem ?? "valid",
  };
}

function checkAgentTools(fm) {
  const tools = (fm.tools ?? "").trim();
  return {
    id: "agent-tools",
    label: "Frontmatter declares tools",
    value: tools.length > 0 ? tools : "absent",
    pass: tools.length > 0,
    detail: tools.length > 0 ? "tools declared" : "no tools line",
  };
}

// An instinct file uses a flat id/trigger/confidence/domain schema instead
// of the memory kind's name/description/metadata.type schema, so it gets
// its own frontmatter check rather than reusing memory-frontmatter.

function confidenceRangeProblem(raw, num) {
  if (num < 0 || num > 1) return `confidence "${raw}" not in range 0 to 1`;
  return null;
}

function confidenceProblem(raw) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "confidence missing";
  const num = Number(trimmed);
  if (Number.isNaN(num)) return `confidence "${raw}" is not a number`;
  return confidenceRangeProblem(raw, num);
}

function missingInstinctField(value, name) {
  return (value ?? "").trim() ? null : `missing ${name}`;
}

function instinctFrontmatterProblem(fm) {
  const nameProblem = missingInstinctField(fm.id, "id") ?? missingInstinctField(fm.trigger, "trigger");
  if (nameProblem) return nameProblem;
  const confProblem = confidenceProblem(fm.confidence);
  if (confProblem) return confProblem;
  return missingInstinctField(fm.domain, "domain");
}

function checkInstinctFrontmatter(fm) {
  const problem = instinctFrontmatterProblem(fm);
  return {
    id: "instinct-frontmatter",
    label: "Frontmatter: id, trigger, confidence 0-1, domain",
    value: problem ?? "ok",
    pass: !problem,
    detail: problem ?? "valid",
  };
}

// --- Scaffolding anti-patterns ---

const SCAFFOLDING_PATTERNS = [
  { pattern: /\bdouble[- ]check\b/i, name: "double-check" },
  { pattern: /\bre-?read\b.*\b(phase|section|step)\b/i, name: "re-read reminder" },
  { pattern: /\bverify (your|you|that you)\b/i, name: "verify-your" },
  { pattern: /\bconfirm (you|that you)\b/i, name: "confirm-you" },
  { pattern: /\breport (your |)progress\b/i, name: "report-progress" },
  { pattern: /\bstatus update\b/i, name: "status-update" },
  { pattern: /\bshow (your |)reasoning\b/i, name: "show-reasoning" },
  { pattern: /\bexplain (your |)thinking\b/i, name: "explain-thinking" },
  { pattern: /\becho (your |)(internal |)reasoning\b/i, name: "echo-reasoning" },
  { pattern: /\btranscribe.*(reasoning|thinking)\b/i, name: "transcribe-reasoning" },
  { pattern: /\btemperature\b/i, name: "temperature-ref" },
  { pattern: /\btop_[pk]\b/i, name: "top-p-k-ref" },
];

function checkScaffolding(body) {
  const hits = scanPatterns(body, SCAFFOLDING_PATTERNS);
  return {
    id: "no-scaffolding",
    label: "No verification/scaffolding anti-patterns",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "none found" : hits.map((h) => `L${h.line}: ${h.name}`).join("; "),
    hits,
  };
}

// --- Conservative filters ---

const CONSERVATIVE_PATTERNS = [
  { pattern: /\bbe conservative\b/i, name: "be-conservative" },
  { pattern: /\bonly (report|flag|mention)\s+(high|critical|severe)/i, name: "only-high-severity" },
  { pattern: /\bminimize (false positives|noise|output)\b/i, name: "minimize-output" },
  { pattern: /\berr on the side of\b/i, name: "err-on-side" },
];

function checkConservativeFilters(body) {
  const hits = scanPatterns(body, CONSERVATIVE_PATTERNS);
  return {
    id: "no-conservative-filters",
    label: "No conservative/filtering instructions",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "none found" : hits.map((h) => `L${h.line}: ${h.name}`).join("; "),
    hits,
  };
}

// --- Scope and structure checks ---

function checkExplicitScope(body) {
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

function checkDelegationCap(body) {
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

function checkWorkedExamples(body) {
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

// The positive regex must not swallow "must not" / "must never" lines;
// otherwise every prohibition contradicts itself.
const MUST_RE = /\b(?:must|always|shall)\s+(?!not\b|never\b)(.{5,40})/i;
const MUST_NOT_RE = /\b(?:must not|never|shall not|do not|don't)\s+(.{5,40})/i;

function isContradiction(pos, neg) {
  if (pos === neg) return true;
  return (pos.length > 8 && neg.includes(pos)) || (neg.length > 8 && pos.includes(neg));
}

function collectDirectives(body) {
  const must = [];
  const mustNot = [];
  for (const { text } of proseLines(body)) {
    const m1 = MUST_RE.exec(text);
    if (m1) must.push(m1[1].toLowerCase().trim());
    const m2 = MUST_NOT_RE.exec(text);
    if (m2) mustNot.push(m2[1].toLowerCase().trim());
  }
  return { must, mustNot };
}

function checkContradictions(body) {
  const { must, mustNot } = collectDirectives(body);
  const found = [];
  for (const pos of must) {
    for (const neg of mustNot) {
      if (isContradiction(pos, neg)) found.push(`"must ${pos}" vs "must not ${neg}"`);
    }
  }
  return {
    id: "no-contradictions",
    label: "No contradictory instructions",
    value: found.length,
    pass: found.length === 0,
    detail: found.length === 0 ? "none found" : found.slice(0, 3).join("; "),
  };
}

function checkConsistentTerminology(body, kind) {
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

// --- Bare negative rules ---

function hasAlternative(line, nextLine) {
  const alt = /\b(instead|use|rather)\b/i;
  return alt.test(line) || alt.test(nextLine) || /^\s*[-*]\s/.test(nextLine);
}

function isDescriptiveNegative(line) {
  const trimmed = line.trim();
  if (/^(the|a|an|this|that|it|each|every|both)\s/i.test(trimmed)) return true;
  if (/^(exit|matching|difference)\s/i.test(trimmed)) return true;
  if (/\bwho\s+(never|does not|doesn't)\b/i.test(trimmed)) return true;
  return false;
}

function checkBareNegatives(body) {
  const hits = [];
  const lines = proseLines(body);
  for (let i = 0; i < lines.length; i++) {
    const neg = /\b(never|do not|don't|must not|shall not)\s+(.{5,60})/i.exec(lines[i].text);
    if (!neg) continue;
    if (isDescriptiveNegative(lines[i].text)) continue;
    const next = (lines[i + 1]?.text ?? "").trim();
    if (!hasAlternative(lines[i].text, next)) {
      hits.push({ line: lines[i].line, text: lines[i].text.trim().slice(0, 60) });
    }
  }
  return {
    id: "no-bare-negatives",
    label: "Negative rules have alternatives",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "all negatives have alternatives" : hits.map((h) => `L${h.line}`).join(", "),
    hits,
  };
}

// --- Implicit scope ---

const IMPLICIT_SCOPE_RE = /\b(apply|format|process)\s+(the|this|that)\s+\w+/i;
const SCOPE_QUANTIFIER_RE = /\b(every|all|each)\b/i;

function checkImplicitScope(body) {
  const hits = [];
  for (const { text, line } of proseLines(body)) {
    if (IMPLICIT_SCOPE_RE.test(text) && !SCOPE_QUANTIFIER_RE.test(text)) {
      hits.push({ line, text: text.trim().slice(0, 60) });
    }
  }
  return {
    id: "no-implicit-scope",
    label: "No implicit scope (use every/all/each)",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "scope explicit" : hits.map((h) => `L${h.line}`).join(", "),
    hits,
  };
}

// --- Drip-fed cross-phase references ---

const DRIP_FED_RE = [
  /\b(see|refer to|as (described|mentioned|defined) in)\s+(phase|step|section)\s+\d/i,
  /\b(above|earlier|previous(ly)?)\s+(phase|step|section)\b/i,
];

function checkDripFed(body) {
  const hits = [];
  for (const { text, line } of proseLines(body)) {
    if (DRIP_FED_RE.some((re) => re.test(text))) {
      hits.push({ line, text: text.trim().slice(0, 60) });
    }
  }
  return {
    id: "no-drip-fed",
    label: "No drip-fed cross-phase references",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "self-contained phases" : hits.map((h) => `L${h.line}`).join(", "),
    hits,
  };
}

// --- Time-sensitive references ---

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
const TIME_SENSITIVE_RE = new RegExp(`\\b(before|after|as of|until|since)\\s+((?:${MONTHS})\\s+\\d{4}|\\d{4})\\b`, "i");

function checkTimeSensitive(body) {
  const hits = [];
  for (const { text, line } of proseLines(body)) {
    if (TIME_SENSITIVE_RE.test(text)) hits.push({ line, text: text.trim().slice(0, 60) });
  }
  return {
    id: "no-time-sensitive",
    label: "No time-sensitive references (dates go stale)",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "none found" : hits.map((h) => `L${h.line}`).join(", "),
    hits,
  };
}

// --- Emphasis density ---

const EMPHASIS_RE = /\b(IMPORTANT|CRITICAL|MANDATORY|YOU MUST|NEVER|ALWAYS)\b/g;

function checkEmphasisDensity(body) {
  let count = 0;
  for (const { text } of proseLines(body)) {
    count += (text.match(EMPHASIS_RE) ?? []).length;
  }
  return {
    id: "emphasis-density",
    label: "Emphasis markers used sparingly (max 2)",
    value: count,
    pass: count <= 2,
    detail: count <= 2 ? `${count} markers` : `${count} caps-emphasis markers, keep at most 2`,
  };
}

// --- Redundant repetition ---

function normalizeForComparison(line) {
  return line.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function trigramSet(text) {
  const words = text.split(" ");
  const grams = new Set();
  for (let i = 0; i <= words.length - 3; i++) {
    grams.add(words.slice(i, i + 3).join(" "));
  }
  return grams;
}

function trigramSimilarity(a, b) {
  const gramsA = trigramSet(a);
  const gramsB = trigramSet(b);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let shared = 0;
  for (const g of gramsA) {
    if (gramsB.has(g)) shared++;
  }
  return shared / Math.min(gramsA.size, gramsB.size);
}

function collectInstructions(body) {
  const result = [];
  for (const { text, line } of proseLines(body)) {
    const norm = normalizeForComparison(text);
    if (norm.length >= 30) result.push({ norm, line, text: text.trim().slice(0, 50) });
  }
  return result;
}

function findNearDuplicates(instructions) {
  const seen = new Set();
  const hits = [];
  for (let i = 0; i < instructions.length; i++) {
    for (let j = i + 1; j < instructions.length; j++) {
      if (Math.abs(instructions[i].line - instructions[j].line) < 3) continue;
      const sim = trigramSimilarity(instructions[i].norm, instructions[j].norm);
      if (sim < 0.75) continue;
      const key = `${instructions[i].line}:${instructions[j].line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ lineA: instructions[i].line, lineB: instructions[j].line, similarity: sim.toFixed(2) });
    }
  }
  return hits;
}

function checkRedundantRepetition(body) {
  const hits = findNearDuplicates(collectInstructions(body));
  return {
    id: "no-redundant-repetition",
    label: "No redundant repeated instructions",
    value: hits.length,
    pass: hits.length === 0,
    detail:
      hits.length === 0
        ? "no near-duplicates"
        : hits.map((h) => `L${h.lineA}~L${h.lineB} (${h.similarity})`).join("; "),
    hits,
  };
}

// --- Scoring ---
// Weights sum to 100, ranked by how hard the post-4.6 guidance leans on
// each property: conciseness and scaffolding removal carry the most.

const WEIGHTS = {
  "line-count": 15,
  "no-scaffolding": 15,
  "no-conservative-filters": 8,
  "no-contradictions": 8,
  "explicit-scope": 6,
  "no-implicit-scope": 5,
  "no-drip-fed": 5,
  "no-redundant-repetition": 5,
  "no-constraining-examples": 5,
  "delegation-cap": 5,
  "description-triggers": 5,
  "no-bare-negatives": 4,
  "description-present": 3,
  "emphasis-density": 3,
  "name-format": 2,
  "description-person": 2,
  "no-at-imports": 2,
  "no-time-sensitive": 1,
  "consistent-terminology": 1,
};

function lineCountScore(lines, targets) {
  const { warn, fail } = targets;
  const span = fail - warn;
  if (lines <= warn) return 1;
  if (lines <= fail) return 1 - (0.5 * (lines - warn)) / span;
  return Math.max(0, 0.5 - (lines - fail) / (4 * span));
}

const boolScore = (c) => (c.pass ? 1 : 0);
const countScore = (tolerance) => (c) => Math.max(0, 1 - c.value / tolerance);

const SCORERS = {
  "line-count": (c) => lineCountScore(c.value, c.targets),
  "name-format": boolScore,
  "description-present": boolScore,
  "description-person": boolScore,
  "description-triggers": boolScore,
  "explicit-scope": boolScore,
  "delegation-cap": boolScore,
  "no-at-imports": countScore(2),
  "no-scaffolding": countScore(5),
  "no-conservative-filters": countScore(3),
  "no-bare-negatives": countScore(4),
  "no-implicit-scope": countScore(4),
  "no-drip-fed": countScore(4),
  "no-redundant-repetition": countScore(4),
  "no-time-sensitive": countScore(2),
  "no-constraining-examples": countScore(3),
  "no-contradictions": countScore(3),
  "consistent-terminology": countScore(3),
  "emphasis-density": (c) => Math.max(0, 1 - Math.max(0, c.value - 2) / 4),
  "memory-frontmatter": boolScore,
  "agent-tools": boolScore,
  "instinct-frontmatter": boolScore,
};

function applyScores(checks, weights) {
  for (const c of checks) {
    c.weight = weights[c.id];
    c.score = Number(SCORERS[c.id](c).toFixed(3));
  }
  return checks;
}

function overallScore(checks) {
  let total = 0;
  for (const c of checks) total += (c.weight ?? 0) * (c.score ?? 0);
  return Math.round(total);
}

// --- Per-kind check membership and weights ---
// Every artifact kind runs a subset of the 19 checks above, plus whatever
// kind-specific checks apply only to it. Weights are taken from ALL_WEIGHTS
// and renormalized so each kind's own subset sums to 100 - that keeps scores
// from different kinds on one comparable scale. A kind-specific check's
// weight lives in KIND_EXTRA_WEIGHTS, scoped to the one kind that runs it,
// so it never enters the skill kind's 19-check baseline.

const CHECK_IDS = Object.keys(WEIGHTS);

const KIND_EXTRA_WEIGHTS = {
  agent: { "agent-tools": 8 },
  memory: { "memory-frontmatter": 8 },
  instinct: { "instinct-frontmatter": 8 },
};

const ALL_WEIGHTS = {
  ...WEIGHTS,
  ...Object.assign({}, ...Object.values(KIND_EXTRA_WEIGHTS)),
};

const FRONTMATTER_CHECK_IDS = [
  "name-format",
  "description-present",
  "description-person",
  "description-triggers",
];

function checkIdsExcluding(...excluded) {
  const drop = new Set(excluded);
  return CHECK_IDS.filter((id) => !drop.has(id));
}

function renormalizedWeights(ids) {
  const sum = ids.reduce((total, id) => total + ALL_WEIGHTS[id], 0);
  const weights = {};
  for (const id of ids) weights[id] = (ALL_WEIGHTS[id] * 100) / sum;
  return weights;
}

const KIND_CHECK_IDS = {
  skill: CHECK_IDS,
  agent: [...checkIdsExcluding("delegation-cap"), ...Object.keys(KIND_EXTRA_WEIGHTS.agent)],
  "claude-md": checkIdsExcluding(...FRONTMATTER_CHECK_IDS, "delegation-cap"),
  memory: [
    ...checkIdsExcluding("description-triggers", "delegation-cap"),
    ...Object.keys(KIND_EXTRA_WEIGHTS.memory),
  ],
  instinct: [
    ...checkIdsExcluding(...FRONTMATTER_CHECK_IDS, "delegation-cap"),
    ...Object.keys(KIND_EXTRA_WEIGHTS.instinct),
  ],
};

const KINDS = Object.fromEntries(
  Object.entries(KIND_CHECK_IDS).map(([kind, ids]) => [
    kind,
    { checkIds: ids, weights: renormalizedWeights(ids) },
  ]),
);

// --- Run all checks ---

const CHECK_RUNNERS = {
  "line-count": (fm, body, kind) => checkLineCount(body, LINE_COUNT_TARGETS[kind]),
  "name-format": (fm, body) => checkNameFormat(fm),
  "description-present": (fm, body) => checkDescriptionPresent(fm),
  "description-person": (fm, body) => checkDescriptionPerson(fm),
  "description-triggers": (fm, body) => checkDescriptionTriggers(fm),
  "no-at-imports": (fm, body) => checkNoAtImports(body),
  "no-scaffolding": (fm, body) => checkScaffolding(body),
  "no-conservative-filters": (fm, body) => checkConservativeFilters(body),
  "no-bare-negatives": (fm, body) => checkBareNegatives(body),
  "no-implicit-scope": (fm, body) => checkImplicitScope(body),
  "no-drip-fed": (fm, body) => checkDripFed(body),
  "no-time-sensitive": (fm, body) => checkTimeSensitive(body),
  "emphasis-density": (fm, body) => checkEmphasisDensity(body),
  "no-redundant-repetition": (fm, body) => checkRedundantRepetition(body),
  "explicit-scope": (fm, body) => checkExplicitScope(body),
  "delegation-cap": (fm, body) => checkDelegationCap(body),
  "no-constraining-examples": (fm, body) => checkWorkedExamples(body),
  "no-contradictions": (fm, body) => checkContradictions(body),
  "consistent-terminology": (fm, body, kind) => checkConsistentTerminology(body, kind),
  "memory-frontmatter": (fm, body, kind, rawFm) => checkMemoryFrontmatter(fm, rawFm),
  "agent-tools": (fm) => checkAgentTools(fm),
  "instinct-frontmatter": (fm) => checkInstinctFrontmatter(fm),
};

function runChecks(text, kind) {
  const fm = parseFrontmatter(text);
  const body = bodyAfterFrontmatter(text);
  const rawFm = rawFrontmatterText(text);
  const { checkIds, weights } = KINDS[kind];
  const checks = checkIds.map((id) => CHECK_RUNNERS[id](fm, body, kind, rawFm));
  return applyScores(checks, weights);
}

// --- Comparison ---

// A baseline saved before the --kind field existed carries no `kind`, and
// that missing field matches any current kind rather than blocking. Only an
// explicit, different kind refuses the comparison - the per-kind weight
// tables make a cross-kind score delta meaningless.

function kindMismatch(beforeKind, currentKind) {
  if (beforeKind === undefined || beforeKind === null) return null;
  if (beforeKind === currentKind) return null;
  return beforeKind;
}

function compare(before, after) {
  const rows = [];
  const beforeById = Object.fromEntries(before.map((c) => [c.id, c]));
  for (const a of after) {
    const b = beforeById[a.id] ?? { pass: false, value: "n/a", detail: "n/a" };
    const status =
      a.pass && !b.pass ? "FIXED" : !a.pass && b.pass ? "REGRESSED" : a.pass ? "PASS" : "FAIL";
    rows.push({
      id: a.id,
      label: a.label,
      before: { pass: b.pass, value: b.value, detail: b.detail, score: b.score ?? 0 },
      after: { pass: a.pass, value: a.value, detail: a.detail, score: a.score ?? 0 },
      status,
    });
  }
  return rows;
}

// --- Output ---

function printChecks(checks, score, kind) {
  process.stdout.write(`kind: ${kind}\n`);
  const maxLabel = Math.max(...checks.map((c) => c.label.length));
  for (const c of checks) {
    const mark = c.pass ? (c.warn ? "~" : "+") : "-";
    const pad = " ".repeat(maxLabel - c.label.length);
    process.stdout.write(`[${mark}] ${c.label}${pad}  ${c.score.toFixed(2)}  ${c.detail}\n`);
  }
  const passed = checks.filter((c) => c.pass).length;
  process.stdout.write(`\n${passed}/${checks.length} passed\n`);
  process.stdout.write(`5.0-readiness: ${score}/100\n`);
}

function printComparison(rows, scores) {
  process.stdout.write("\n  Before / After migration check\n");
  process.stdout.write("  " + "-".repeat(70) + "\n");
  for (const r of rows) {
    const icon = { FIXED: "+", REGRESSED: "!", PASS: "=", FAIL: "x" }[r.status];
    process.stdout.write(
      `  [${icon}] ${r.status.padEnd(10)} ${r.label}\n` +
        `      before: ${r.before.detail}\n` +
        `      after:  ${r.after.detail}\n`,
    );
  }
  const fixed = rows.filter((r) => r.status === "FIXED").length;
  const regressed = rows.filter((r) => r.status === "REGRESSED").length;
  const passing = rows.filter((r) => r.status === "PASS" || r.status === "FIXED").length;
  const delta = scores.after - scores.before;
  process.stdout.write(
    `\n  ${passing}/${rows.length} passing, ${fixed} fixed, ${regressed} regressed\n`,
  );
  process.stdout.write(
    `  5.0-readiness: ${scores.before}/100 -> ${scores.after}/100 (${delta >= 0 ? "+" : ""}${delta})\n`,
  );
}

// --- CLI ---

function parseArgs(argv) {
  const args = { positional: [] };
  for (const item of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(item);
    if (match) {
      args[match[1]] = match[2] ?? "true";
    } else {
      args.positional.push(item);
    }
  }
  return args;
}

function printComparisonResult(beforeData, checks, score, kind, asJson) {
  const rows = compare(beforeData.checks, checks);
  const scores = { before: beforeData.score ?? overallScore(beforeData.checks), after: score };
  const exit = rows.some((r) => r.status === "REGRESSED") ? 1 : 0;
  if (asJson) {
    const out = { ...scores, delta: scores.after - scores.before, kind, rows };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return exit;
  }
  printComparison(rows, scores);
  return exit;
}

function runComparison(args, checks, score, kind) {
  const beforeData = JSON.parse(readFileSync(args.before, "utf8"));
  const mismatch = kindMismatch(beforeData.kind, kind);
  if (mismatch) {
    process.stderr.write(`Cannot compare: baseline kind "${mismatch}" does not match current kind "${kind}"\n`);
    return 3;
  }
  return printComparisonResult(beforeData, checks, score, kind, args.json === "true");
}

function resolveKind(args, target, text) {
  if (!args.kind) return detectKind(target, text);
  if (!Object.hasOwn(KINDS, args.kind)) return null;
  return args.kind;
}

function main(argv) {
  const args = parseArgs(argv);
  const target = args.positional[0];
  if (!target) {
    process.stderr.write(`${USAGE}\n`);
    return 3;
  }

  let text;
  try {
    text = readFileSync(target, "utf8");
  } catch (err) {
    process.stderr.write(`Cannot read ${target}: ${err.message}\n`);
    return 3;
  }
  const kind = resolveKind(args, target, text);
  if (!kind) {
    process.stderr.write(`Unknown --kind: ${args.kind}. Expected one of: ${Object.keys(KINDS).join(", ")}\n`);
    return 3;
  }
  const checks = runChecks(text, kind);
  const score = overallScore(checks);

  if (args.save) {
    const data = { file: target, kind, score, checks, timestamp: new Date().toISOString() };
    writeFileSync(args.save, JSON.stringify(data, null, 2));
  }

  if (args.before) return runComparison(args, checks, score, kind);

  if (args.json === "true") {
    process.stdout.write(`${JSON.stringify({ score, checks, kind }, null, 2)}\n`);
  } else {
    printChecks(checks, score, kind);
  }
  return checks.every((c) => c.pass) ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
