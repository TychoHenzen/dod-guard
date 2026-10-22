#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { readTextFile } from "../../../lib/read-text.mjs";
import { codeShapeTokens, ngrams, tokens } from "./overlap-tokens.mjs";

async function filesAt(path) {
  const info = await stat(path);
  if (info.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.filter((entry) => !entry.name.startsWith(".")).map((entry) => filesAt(join(path, entry.name))),
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

function runLengthAt(left, right, leftIndex, rightIndex) {
  let length = 0;
  while (
    left[leftIndex + length] === right[rightIndex + length] &&
    leftIndex + length < left.length &&
    rightIndex + length < right.length
  ) {
    length += 1;
  }
  return length;
}

function longestRun(left, right) {
  let longest = 0;
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      longest = Math.max(longest, runLengthAt(left, right, leftIndex, rightIndex));
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

function proseMetrics(base, original, rewrite) {
  const sentences = overlapRate(normalizedSentences(original), normalizedSentences(rewrite));
  const pass = base.sample < 40 || (base.run <= 15 && base.ngram <= 0.2 && sentences <= 0.4 && base.order <= 0.6);
  return { sentences, pass };
}

function codeMetrics(base, original, rewrite) {
  const lines = overlapRate(normalizedLines(original), normalizedLines(rewrite));
  const shapeNgram = overlapRate(ngrams(codeShapeTokens(original), 4), ngrams(codeShapeTokens(rewrite), 4));
  const pass =
    base.sample < 40 ||
    (base.run <= 60 && base.ngram <= 0.65 && shapeNgram <= 0.65 && lines <= 0.35 && base.order <= 0.5);
  return { lines, shapeNgram, pass };
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!(options.original && options.rewrite)) {
    console.error("usage: overlap-scan.mjs --original=<path> --rewrite=<path> [--mode=code|prose]");
    process.exitCode = 2;
    return;
  }
  const [original, rewrite] = await Promise.all([readTree(options.original), readTree(options.rewrite)]);
  const metrics = scoreOverlap(original, rewrite, {
    mode: options.mode,
    whitelist: options.whitelist,
    contract: loadContract(options["contract-file"] ? readTextFile(options["contract-file"]) : ""),
  });
  console.log(
    JSON.stringify({
      original: relative(process.cwd(), options.original),
      rewrite: relative(process.cwd(), options.rewrite),
      mode: options.mode,
      ...metrics,
    }),
  );
  process.exitCode = metrics.pass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
