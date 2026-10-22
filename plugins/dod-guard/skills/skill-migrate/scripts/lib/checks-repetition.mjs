import { hitsResult } from "./check-result.mjs";
import { proseLines } from "./text.mjs";

// --- Redundant repetition ---

const SIMILARITY_THRESHOLD = 0.75;
const MIN_LINE_GAP = 3;

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

function duplicateHit(a, b) {
  if (Math.abs(a.line - b.line) < MIN_LINE_GAP) return null;
  const sim = trigramSimilarity(a.norm, b.norm);
  return sim < SIMILARITY_THRESHOLD ? null : { lineA: a.line, lineB: b.line, similarity: sim.toFixed(2) };
}

function findNearDuplicates(instructions) {
  return instructions.flatMap((a, i) =>
    instructions
      .slice(i + 1)
      .map((b) => duplicateHit(a, b))
      .filter(Boolean),
  );
}

export function checkRedundantRepetition(body) {
  return hitsResult({
    id: "no-redundant-repetition",
    label: "No redundant repeated instructions",
    hits: findNearDuplicates(collectInstructions(body)),
    none: "no near-duplicates",
    describe: (h) => `L${h.lineA}~L${h.lineB} (${h.similarity})`,
  });
}
