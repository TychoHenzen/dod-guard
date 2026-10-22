import { atLineNamed, hitsResult, scanPatterns } from "./check-result.mjs";

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
  return hitsResult({
    id: "no-scaffolding",
    label: "No verification/scaffolding anti-patterns",
    hits: scanPatterns(body, SCAFFOLDING_PATTERNS),
    none: "none found",
    describe: atLineNamed,
  });
}

// --- Conservative filters ---

const CONSERVATIVE_PATTERNS = [
  { pattern: /\bbe conservative\b/i, name: "be-conservative" },
  { pattern: /\bonly (report|flag|mention)\s+(high|critical|severe)/i, name: "only-high-severity" },
  { pattern: /\bminimize (false positives|noise|output)\b/i, name: "minimize-output" },
  { pattern: /\berr on the side of\b/i, name: "err-on-side" },
];

export function checkConservativeFilters(body) {
  return hitsResult({
    id: "no-conservative-filters",
    label: "No conservative/filtering instructions",
    hits: scanPatterns(body, CONSERVATIVE_PATTERNS),
    none: "none found",
    describe: atLineNamed,
  });
}
