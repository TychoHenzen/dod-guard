import { longestRun, orderSimilarity } from "./overlap-sequence.mjs";
import { codeShapeTokens, ngrams, tokens } from "./overlap-tokens.mjs";

// Pass limits per mode. The sample size gate skips both: a tiny sample cannot overlap meaningfully.
const MIN_SAMPLE = 40;
const PROSE_LIMITS = { run: 15, ngram: 0.2, sentences: 0.4, order: 0.6 };
const CODE_LIMITS = { run: 60, ngram: 0.65, shapeNgram: 0.65, lines: 0.35, order: 0.5 };
const SENTENCE_BREAK = /[.!?]+\s*/;
const LINE_BREAK = /\r?\n/;

function withinLimits(metrics, limits) {
  return metrics.sample < MIN_SAMPLE || Object.entries(limits).every(([name, limit]) => metrics[name] <= limit);
}

function stripExemptions(text, { whitelist, contract }) {
  let result = text;
  for (const value of [...whitelist, ...(contract ?? [])]) {
    result = result.replaceAll(value, " ");
  }
  return result;
}

function normalizedParts(text, separator) {
  return new Set(
    text
      .split(separator)
      .map((part) => part.replace(/\s+/g, " ").trim().toLowerCase())
      .filter(Boolean),
  );
}

function overlapRate(left, right) {
  if (right.size === 0) return 0;
  let matches = 0;
  for (const value of right) if (left.has(value)) matches += 1;
  return matches / right.size;
}

function partsRate(original, rewrite, separator) {
  return overlapRate(normalizedParts(original, separator), normalizedParts(rewrite, separator));
}

function proseMetrics(base, original, rewrite) {
  const sentences = partsRate(original, rewrite, SENTENCE_BREAK);
  return { sentences, pass: withinLimits({ ...base, sentences }, PROSE_LIMITS) };
}

function codeMetrics(base, original, rewrite) {
  const lines = partsRate(original, rewrite, LINE_BREAK);
  const shapeNgram = overlapRate(ngrams(codeShapeTokens(original), 4), ngrams(codeShapeTokens(rewrite), 4));
  return { lines, shapeNgram, pass: withinLimits({ ...base, lines, shapeNgram }, CODE_LIMITS) };
}

export function scoreOverlap(original, rewrite, { mode = "code", whitelist = [], contract = [] } = {}) {
  const cleanOriginal = stripExemptions(original, { whitelist, contract });
  const cleanRewrite = stripExemptions(rewrite, { whitelist, contract });
  const left = tokens(cleanOriginal);
  const right = tokens(cleanRewrite);
  const base = {
    run: longestRun(left, right),
    ngram: overlapRate(ngrams(left, 4), ngrams(right, 4)),
    order: orderSimilarity(left, right),
    sample: Math.max(left.length, right.length),
  };
  const extra = mode === "prose" ? proseMetrics : codeMetrics;
  return { ...base, ...extra(base, cleanOriginal, cleanRewrite) };
}
