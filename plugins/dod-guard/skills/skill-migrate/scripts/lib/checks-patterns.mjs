import { atLine, hitsResult, lineHits } from "./check-result.mjs";
import { proseLines } from "./text.mjs";

// --- Implicit scope ---

const IMPLICIT_SCOPE_RE = /\b(apply|format|process)\s+(the|this|that)\s+\w+/i;
const SCOPE_QUANTIFIER_RE = /\b(every|all|each)\b/i;

export function checkImplicitScope(body) {
  return hitsResult({
    id: "no-implicit-scope",
    label: "No implicit scope (use every/all/each)",
    hits: lineHits(body, (t) => IMPLICIT_SCOPE_RE.test(t) && !SCOPE_QUANTIFIER_RE.test(t)),
    none: "scope explicit",
    describe: atLine,
    separator: ", ",
  });
}

// --- Drip-fed cross-phase references ---

const DRIP_FED_RE = [
  /\b(see|refer to|as (described|mentioned|defined) in)\s+(phase|step|section)\s+\d/i,
  /\b(above|earlier|previous(ly)?)\s+(phase|step|section)\b/i,
];

export function checkDripFed(body) {
  return hitsResult({
    id: "no-drip-fed",
    label: "No drip-fed cross-phase references",
    hits: lineHits(body, (t) => DRIP_FED_RE.some((re) => re.test(t))),
    none: "self-contained phases",
    describe: atLine,
    separator: ", ",
  });
}

// --- Time-sensitive references ---

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
const TIME_SENSITIVE_RE = new RegExp(`\\b(before|after|as of|until|since)\\s+((?:${MONTHS})\\s+\\d{4}|\\d{4})\\b`, "i");

export function checkTimeSensitive(body) {
  return hitsResult({
    id: "no-time-sensitive",
    label: "No time-sensitive references (dates go stale)",
    hits: lineHits(body, (t) => TIME_SENSITIVE_RE.test(t)),
    none: "none found",
    describe: atLine,
    separator: ", ",
  });
}

// --- Emphasis density ---

const EMPHASIS_RE = /\b(IMPORTANT|CRITICAL|MANDATORY|YOU MUST|NEVER|ALWAYS)\b/g;

export function checkEmphasisDensity(body) {
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
