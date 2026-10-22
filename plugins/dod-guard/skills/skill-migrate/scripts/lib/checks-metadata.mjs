import { cleanDescription } from "./text.mjs";

// --- Individual checks ---

export function checkLineCount(body, targets) {
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

export function checkNameFormat(fm) {
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

export function checkDescriptionPresent(fm) {
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

export function checkDescriptionPerson(fm) {
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

export function checkDescriptionTriggers(fm) {
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

export function checkNoAtImports(body) {
  const hits = body
    .split(/\r?\n/)
    .filter(isAtImport)
    .map((l) => l.trim());
  return {
    id: "no-at-imports",
    label: "No @-imports in SKILL.md",
    value: hits.length,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "none found" : `found: ${hits.slice(0, 3).join(", ")}`,
  };
}
