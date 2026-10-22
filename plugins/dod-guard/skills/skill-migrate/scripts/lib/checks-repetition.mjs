import { proseLines } from "./text.mjs";

// --- Redundant repetition ---

function normalizeForComparison(line) {
  return line
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

export function checkRedundantRepetition(body) {
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
