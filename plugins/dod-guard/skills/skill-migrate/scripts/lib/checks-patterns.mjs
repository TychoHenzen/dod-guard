import { scanPatterns } from "./check-result.mjs";
import { proseLines } from "./text.mjs";

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

export function checkScaffolding(body) {
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

export function checkConservativeFilters(body) {
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

// --- Implicit scope ---

const IMPLICIT_SCOPE_RE = /\b(apply|format|process)\s+(the|this|that)\s+\w+/i;
const SCOPE_QUANTIFIER_RE = /\b(every|all|each)\b/i;

export function checkImplicitScope(body) {
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

export function checkDripFed(body) {
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

export function checkTimeSensitive(body) {
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
