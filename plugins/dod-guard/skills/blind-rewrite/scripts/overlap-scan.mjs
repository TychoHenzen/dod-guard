#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function tokens(text) {
  return text.toLowerCase().match(/[a-z0-9_$#@.-]+/g) ?? [];
}

async function filesAt(path) {
  const info = await stat(path);
  if (info.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => filesAt(join(path, entry.name))),
  );
  return nested.flat();
}

async function readTree(path) {
  const files = await filesAt(path);
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}

function parseArgs(argv) {
  const options = { mode: "code", whitelist: [] };
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) options[match[1]] = match[2];
  }
  options.whitelist = String(options.whitelist ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return options;
}

function stripExemptions(text, { whitelist, contract }) {
  let result = text;
  for (const value of [...whitelist, ...(contract ?? [])]) {
    result = result.replaceAll(value, " ");
  }
  return result;
}

function ngrams(values, size) {
  const result = new Set();
  for (let index = 0; index <= values.length - size; index += 1) {
    result.add(values.slice(index, index + size).join(" "));
  }
  return result;
}

const CODE_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "of",
  "return",
  "switch",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

function codeShapeTokens(text) {
  return tokens(text).map((token) => {
    if (/^\d+(?:\.\d+)?$/.test(token)) return "$number";
    if (/^[a-z_$][a-z0-9_$.-]*$/i.test(token) && !CODE_KEYWORDS.has(token)) return "$identifier";
    return token;
  });
}

function longestRun(left, right) {
  let longest = 0;
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      if (left[leftIndex] !== right[rightIndex]) continue;
      let length = 0;
      while (
        left[leftIndex + length] === right[rightIndex + length] &&
        leftIndex + length < left.length &&
        rightIndex + length < right.length
      ) {
        length += 1;
      }
      longest = Math.max(longest, length);
    }
  }
  return longest;
}

function orderSimilarity(left, right) {
  const positions = new Map();
  left.forEach((value, index) => {
    const list = positions.get(value) ?? [];
    list.push(index);
    positions.set(value, list);
  });
  const sequence = right.flatMap((value) => positions.get(value) ?? []);
  const tails = [];
  for (const value of sequence) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (tails[middle] < value) low = middle + 1;
      else high = middle;
    }
    tails[low] = value;
  }
  return right.length === 0 ? 0 : tails.length / right.length;
}

function normalizedLines(text) {
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim().toLowerCase())
      .filter(Boolean),
  );
}

function normalizedSentences(text) {
  return new Set(
    text
      .split(/[.!?]+\s*/)
      .map((sentence) => sentence.replace(/\s+/g, " ").trim().toLowerCase())
      .filter(Boolean),
  );
}

function overlapRate(left, right) {
  if (right.size === 0) return 0;
  let matches = 0;
  for (const value of right) if (left.has(value)) matches += 1;
  return matches / right.size;
}

function loadContract(value) {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/^Verbatim\s*:\s*/i, ""));
}

export function scoreOverlap(original, rewrite, { mode = "code", whitelist = [], contract = [] } = {}) {
  const cleanOriginal = stripExemptions(original, { whitelist, contract });
  const cleanRewrite = stripExemptions(rewrite, { whitelist, contract });
  const left = tokens(cleanOriginal);
  const right = tokens(cleanRewrite);
  const ngramRate = overlapRate(ngrams(left, 4), ngrams(right, 4));
  const metrics = {
    run: longestRun(left, right),
    ngram: ngramRate,
    order: orderSimilarity(left, right),
    sample: Math.max(left.length, right.length),
  };
  if (mode === "prose") {
    metrics.sentences = overlapRate(normalizedSentences(cleanOriginal), normalizedSentences(cleanRewrite));
    metrics.pass =
      metrics.sample < 40 ||
      (metrics.run <= 15 && metrics.ngram <= 0.2 && metrics.sentences <= 0.4 && metrics.order <= 0.6);
  } else {
    metrics.lines = overlapRate(normalizedLines(cleanOriginal), normalizedLines(cleanRewrite));
    metrics.shapeNgram = overlapRate(ngrams(codeShapeTokens(cleanOriginal), 4), ngrams(codeShapeTokens(cleanRewrite), 4));
    metrics.pass =
      metrics.sample < 40 ||
      (metrics.run <= 60 && metrics.ngram <= 0.65 && metrics.shapeNgram <= 0.65 && metrics.lines <= 0.35 && metrics.order <= 0.5);
  }
  return metrics;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.original || !options.rewrite) {
    console.error("usage: overlap-scan.mjs --original=<path> --rewrite=<path> [--mode=code|prose]");
    process.exitCode = 2;
    return;
  }
  const [original, rewrite] = await Promise.all([readTree(options.original), readTree(options.rewrite)]);
  const metrics = scoreOverlap(original, rewrite, {
    mode: options.mode,
    whitelist: options.whitelist,
    contract: loadContract(options["contract-file"]),
  });
  console.log(JSON.stringify({
    original: relative(process.cwd(), options.original),
    rewrite: relative(process.cwd(), options.rewrite),
    mode: options.mode,
    ...metrics,
  }));
  process.exitCode = metrics.pass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
