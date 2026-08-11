#!/usr/bin/env node
// audit-assumptions collects every marked guess in the repository. A human
// then works each one to a verdict: confirmed and deleted, wrong and fixed,
// or still open. This script only collects and reports. Judging a hit needs
// reading the surrounding code, which this script does not do.
//
// This is a plain line match, not a comment parser. Two restrictions keep it
// from matching prose about the convention, or the marker quoted as test
// data:
//
//   1. Only source files are walked. This repository's source extensions
//      are .ts, .js, .mjs, .cjs, .tsx, .jsx. A markdown file cannot hold a
//      code comment, so every doc that discusses the convention is skipped.
//   2. The trimmed line must START with a comment opener: //, #, /*, or *.
//      A marker quoted inside a string literal begins with a quote
//      character or with code, not a comment opener, so it is not a hit.
//
// The marker text this script searches for also appears in its own source
// (this header, and the pattern below). It excludes its own file by path so
// every run does not report itself.
//
// Usage: node scripts/audit-assumptions.mjs [--json]
//
// Exit codes:
//   0  ran to completion, with or without hits
//   3  usage error

import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toPosix, walkFiles } from "./ci/lib/fs-utils.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = toPosix(ROOT, fileURLToPath(import.meta.url));
const MARKER = /\bASSUMPTION:/;
const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".tsx", ".jsx"]);
const COMMENT_OPENERS = ["//", "#", "/*", "*"];

function isCommentLine(trimmed) {
  return COMMENT_OPENERS.some((opener) => trimmed.startsWith(opener));
}

function findHits(file) {
  const relPath = toPosix(ROOT, file);
  if (relPath === SELF) return [];
  if (!SOURCE_EXTENSIONS.has(extname(file))) return [];
  const text = readFileSync(file, "utf8");
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (MARKER.test(trimmed) && isCommentLine(trimmed)) {
      hits.push({ file: relPath, line: index + 1, text: trimmed });
    }
  });
  return hits;
}

function collectHits() {
  const hits = [];
  for (const file of walkFiles(ROOT)) hits.push(...findHits(file));
  return hits;
}

function printJson(hits) {
  process.stdout.write(`${JSON.stringify({ count: hits.length, hits }, null, 2)}\n`);
}

function printText(hits) {
  if (hits.length === 0) {
    process.stdout.write("assumption audit: 0 found - clean\n");
    return;
  }
  process.stdout.write(`assumption audit: ${hits.length} found\n\n`);
  for (const hit of hits) process.stdout.write(`  ${hit.file}:${hit.line}  ${hit.text}\n`);
}

function main(argv) {
  const unknown = argv.filter((a) => a !== "--json");
  if (unknown.length > 0) {
    process.stderr.write(`unknown option: ${unknown[0]}\nusage: audit-assumptions.mjs [--json]\n`);
    return 3;
  }
  const hits = collectHits();
  if (argv.includes("--json")) {
    printJson(hits);
    return 0;
  }
  printText(hits);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
