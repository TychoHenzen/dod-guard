import { proseLines } from "./text.mjs";

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

export function checkContradictions(body) {
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

export function checkBareNegatives(body) {
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
