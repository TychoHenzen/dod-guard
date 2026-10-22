import { proseLines } from "./text.mjs";

export function scanPatterns(body, patterns) {
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
