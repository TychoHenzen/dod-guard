import { unique } from "./architecture-language.mjs";

const IMPORT_PATTERNS = {
  ts: /\b(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/g,
  cs: /^\s*using\s+([\w.]+)/gm,
  java: /^\s*import\s+([\w.*]+)/gm,
  rs: /^\s*use\s+([^;\n]+)/gm,
  py: /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm,
  go: /^\s*import\s+(?:\([^)]*?\)|"([^"]+)")/gms,
  cpp: /^\s*#include\s+[<"]([^>"]+)[>"]/gm,
};

function importValues(match, lang) {
  if (lang !== "go" || !match[0].includes("(")) return [match[1] ?? match[2]];
  return [...match[0].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

export function importsFor(source, lang) {
  const pattern = IMPORT_PATTERNS[lang];
  if (!pattern) return [];
  const found = [];
  let match = pattern.exec(source);
  while (match !== null) {
    found.push(...importValues(match, lang));
    match = pattern.exec(source);
  }
  return unique(found.filter(Boolean));
}
