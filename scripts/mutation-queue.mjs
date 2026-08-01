#!/usr/bin/env node

// mutation-queue.mjs - Turn mutation survivors into a test-integrity work queue.
//
// micro-mutations.mjs records every mutant the test suite failed to kill in
// .data/micro-mutations/survivors/<name>.json, against compiled dist paths.
// This script maps those back to source lines through the tsc source maps.
// It then ranks the files by how little their tests verify. The result is a
// queue the /test-integrity-checker skill reads as its target list.
//
// A surviving mutant is direct evidence of the pattern that skill hunts: the
// production code changed and every test still passed.
//
// Usage:
//   node scripts/mutation-queue.mjs            # write queue.json, print table
//   node scripts/mutation-queue.mjs --top=5    # limit the printed table

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, ".data", "micro-mutations");
const SURVIVORS_DIR = join(DATA_DIR, "survivors");
const QUEUE_FILE = join(DATA_DIR, "queue.json");

const topArg = process.argv.find((a) => a.startsWith("--top="));
const TOP = topArg ? Number(topArg.split("=")[1]) : 10;

// ── Source map decoding ─────────────────────────────────────────────────

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decode one Base64 VLQ segment list into an array of signed integers. */
function decodeVlq(segment) {
  const values = [];
  let shift = 0;
  let value = 0;
  for (const char of segment) {
    const digit = B64.indexOf(char);
    if (digit < 0) return values;
    const hasContinuation = (digit & 32) !== 0;
    value += (digit & 31) << shift;
    if (hasContinuation) {
      shift += 5;
      continue;
    }
    const negative = (value & 1) === 1;
    value >>= 1;
    values.push(negative ? -value : value);
    shift = 0;
    value = 0;
  }
  return values;
}

/**
 * Build a generated-line to source-line lookup from a .js.map file.
 * Returns a Map keyed by 1-based generated line, holding the first source
 * line that line maps to. Column precision is not useful here, because a
 * mutant is reported against a statement, not a token.
 */
function buildLineMap(mapPath) {
  const raw = JSON.parse(readFileSync(mapPath, "utf-8"));
  const lookup = new Map();
  let sourceLine = 0;
  const lines = raw.mappings.split(";");
  for (let generated = 0; generated < lines.length; generated++) {
    if (!lines[generated]) continue;
    for (const segment of lines[generated].split(",")) {
      const fields = decodeVlq(segment);
      if (fields.length < 4) continue;
      sourceLine += fields[2];
      if (!lookup.has(generated + 1)) lookup.set(generated + 1, sourceLine + 1);
    }
  }
  return { lookup, source: raw.sources?.[0] ?? null };
}

/** Map a dist file path plus line to a source line, or null when unavailable. */
function toSourceLine(distPath, line, mapCache) {
  const mapPath = join(ROOT, `${distPath}.map`);
  if (!existsSync(mapPath)) return null;
  if (!mapCache.has(mapPath)) mapCache.set(mapPath, buildLineMap(mapPath));
  return mapCache.get(mapPath).lookup.get(line) ?? null;
}

// ── Queue construction ──────────────────────────────────────────────────

/** Locate the test file that covers a source file, or null when none exists. */
function testFileFor(srcPath) {
  const candidate = srcPath.replace(/\.ts$/, ".test.ts");
  return existsSync(join(ROOT, candidate)) ? candidate : null;
}

/**
 * Rank key: how much of the file's behavior the tests fail to pin.
 * A file whose tests kill nothing scores its full survivor count. A file with
 * a strong suite scores a fraction of it. Higher means more suspect.
 */
function suspicionScore(summary) {
  const tested = summary.killed + summary.survived;
  if (tested === 0) return 0;
  const killRate = summary.killed / tested;
  return Math.round(summary.survived * (1 - killRate));
}

/** Add one survivor to the per-line tally. */
function recordHotspot(byLine, srcLine, mutant) {
  if (!byLine.has(srcLine)) {
    byLine.set(srcLine, { line: srcLine, count: 0, mutators: new Set() });
  }
  const entry = byLine.get(srcLine);
  entry.count += 1;
  entry.mutators.add(mutant.mutator ?? "unknown");
}

/**
 * Group survivors by source line, keeping the mutator names seen at each.
 * A survivor whose generated line has no mapping was recorded against an
 * older build, so it is counted as unmapped rather than guessed at.
 */
function clusterByLine(survivors, mapCache) {
  const byLine = new Map();
  let unmapped = 0;
  for (const mutant of survivors) {
    const srcLine = toSourceLine(mutant.file, mutant.line, mapCache);
    if (srcLine === null) {
      unmapped += 1;
      continue;
    }
    recordHotspot(byLine, srcLine, mutant);
  }
  const hotspots = [...byLine.values()]
    .sort((a, b) => b.count - a.count)
    .map((e) => ({ line: e.line, count: e.count, mutators: [...e.mutators].sort() }));
  return { hotspots, unmapped };
}

function buildEntry(reportPath, mapCache) {
  const report = JSON.parse(readFileSync(reportPath, "utf-8"));
  const srcPath = report.source;
  if (!existsSync(join(ROOT, srcPath))) return null; // source was deleted
  const survivors = report.survivors ?? [];
  const { hotspots, unmapped } = clusterByLine(survivors, mapCache);
  return {
    source: srcPath,
    test: testFileFor(srcPath),
    date: report.date,
    summary: report.summary,
    score: suspicionScore(report.summary),
    // Most lines unmappable means the report predates the current build.
    stale: survivors.length > 0 && unmapped > survivors.length / 2,
    unmapped,
    hotspots: hotspots.slice(0, 12),
  };
}

function buildQueue() {
  if (!existsSync(SURVIVORS_DIR)) return [];
  const mapCache = new Map();
  const entries = [];
  for (const name of readdirSync(SURVIVORS_DIR)) {
    if (!name.endsWith(".json")) continue;
    const entry = buildEntry(join(SURVIVORS_DIR, name), mapCache);
    if (entry) entries.push(entry);
  }
  return entries.sort((a, b) => b.score - a.score);
}

// ── Reporting ───────────────────────────────────────────────────────────

function killRateText(summary) {
  const tested = summary.killed + summary.survived;
  if (tested === 0) return "n/a";
  return `${Math.round((summary.killed / tested) * 100)}%`;
}

/** Render the warning flags for one queue entry, or an empty string. */
function flagText(entry) {
  const flags = [];
  if (!entry.test) flags.push("NO TEST FILE");
  if (entry.stale) flags.push("STALE");
  return flags.length > 0 ? `  (${flags.join(", ")})` : "";
}

function printTable(queue) {
  console.log(`\nTest-integrity queue - ${queue.length} files with surviving mutants\n`);
  console.log("score  kill%  survived  file");
  for (const entry of queue.slice(0, TOP)) {
    const score = String(entry.score).padStart(5);
    const rate = killRateText(entry.summary).padStart(6);
    const survived = String(entry.summary.survived).padStart(9);
    const flags = flagText(entry);
    console.log(`${score} ${rate} ${survived}  ${entry.source}${flags}`);
  }
  if (queue.length > TOP) console.log(`  ... ${queue.length - TOP} more in ${QUEUE_FILE}`);
}

function main() {
  const queue = buildQueue();
  if (queue.length === 0) {
    console.log("No survivor reports found. Run scripts/micro-mutations.mjs first.");
    return;
  }
  writeFileSync(QUEUE_FILE, JSON.stringify({ generated: new Date().toISOString(), queue }, null, 2));
  printTable(queue);
  console.log(`\nQueue written to ${QUEUE_FILE}`);
  console.log("Audit the top entry with: /dod-guard:test-integrity-checker");
}

main();
