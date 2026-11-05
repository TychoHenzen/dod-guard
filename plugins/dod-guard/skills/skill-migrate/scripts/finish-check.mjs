#!/usr/bin/env node

import { existsSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { readTextFile } from "../../../lib/read-text.mjs";

const INLINE_MIN_WORDS = 2;
const USAGE =
  "usage: finish-check.mjs --original=<path> --rewrite=<path> --contract=<path> --verbatim=<path> --approvals=<path> --audit=<path>";
const APPROVED_CUTS_HEADING = "### Approved cuts";
const REQUIRED_OPTIONS = ["original", "rewrite", "contract", "verbatim", "approvals", "audit"];
const DROP_TEXT_LIMIT = 200;

// Trim every line and drop blank ones so indentation and CRLF never decide a match.
export function normalize(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function withoutFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

// Returns { fenced: string[], inline: string[] } from the original, frontmatter excluded.
export function extractExactText(text) {
  const lines = withoutFrontmatter(text).replace(/\r\n/g, "\n").split("\n");
  const fenced = [];
  const prose = [];
  let block = null;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (block === null) block = [];
      else {
        fenced.push(block.join("\n"));
        block = null;
      }
      continue;
    }
    if (block === null) prose.push(line);
    else block.push(line);
  }
  const inline = [];
  for (const match of prose.join("\n").matchAll(/`([^`\n]+)`/g)) {
    const span = match[1].trim();
    if (span.split(/\s+/).length >= INLINE_MIN_WORDS) inline.push(span);
  }
  return { fenced: [...new Set(fenced.filter((b) => normalize(b)))], inline: [...new Set(inline)] };
}

// Returns the approvals problems as strings; an empty array means well formed.
export function approvalProblems(value) {
  if (value === null || typeof value !== "object" || !Array.isArray(value.approvedCuts)) {
    return ['approvals must be an object with an "approvedCuts" array'];
  }
  const problems = [];
  value.approvedCuts.forEach((cut, index) => {
    const label = `approvedCuts[${index}]`;
    if (cut === null || typeof cut !== "object") return problems.push(`${label} must be an object`);
    if (typeof cut.reason !== "string" || !cut.reason.trim()) problems.push(`${label} needs a non-empty reason`);
    const hasText = typeof cut.text === "string" && cut.text.trim();
    const hasClaim = typeof cut.claim === "string" && cut.claim.trim();
    if (!hasText && !hasClaim) problems.push(`${label} needs a non-empty text or claim`);
  });
  return problems;
}

// items: [{ kind, text }]. A text is kept when the rewrite holds it, or when an approved cut holds it.
export function droppedItems(items, rewrite, approvedTexts) {
  const rewriteNorm = normalize(rewrite);
  const cutNorms = approvedTexts.map(normalize);
  return items.filter((item) => {
    const needle = normalize(item.text);
    return needle && !rewriteNorm.includes(needle) && !cutNorms.some((cut) => cut.includes(needle));
  });
}

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) options[match[1]] = match[2];
  }
  return options;
}

function readOrNull(path) {
  try {
    return { text: readTextFile(path) };
  } catch {
    return null;
  }
}

// A file that is absent or blank is "missing or empty"; one that cannot be decoded is "unreadable".
function checkRequiredText(path, problems) {
  if (!existsSync(path)) {
    problems.push({ file: path, problem: "missing or empty" });
    return null;
  }
  const read = readOrNull(path);
  if (!read) {
    problems.push({ file: path, problem: "unreadable" });
    return null;
  }
  if (!read.text.trim()) {
    problems.push({ file: path, problem: "missing or empty" });
    return null;
  }
  return read.text;
}

function checkAudit(path, problems) {
  const text = checkRequiredText(path, problems);
  if (text === null) return;
  const hasHeading = text.split(/\r?\n/).some((line) => line.trim() === APPROVED_CUTS_HEADING);
  if (!hasHeading) problems.push({ file: path, problem: "no ### Approved cuts heading" });
}

// Returns the verbatim text, or null when the file is absent or unreadable.
function checkVerbatim(path, problems) {
  if (!existsSync(path)) {
    problems.push({ file: path, problem: "missing" });
    return null;
  }
  const read = readOrNull(path);
  if (!read) {
    problems.push({ file: path, problem: "unreadable" });
    return null;
  }
  return read.text;
}

// Returns the approved cut texts; an unusable approvals file approves nothing.
function checkApprovals(path, problems) {
  if (!existsSync(path)) {
    problems.push({ file: path, problem: "missing" });
    return [];
  }
  const read = readOrNull(path);
  if (!read) {
    problems.push({ file: path, problem: "unreadable" });
    return [];
  }
  let value;
  try {
    value = JSON.parse(read.text);
  } catch {
    problems.push({ file: path, problem: "not JSON" });
    return [];
  }
  const found = approvalProblems(value);
  for (const problem of found) problems.push({ file: path, problem });
  if (found.length > 0) return [];
  return value.approvedCuts.map((cut) => cut.text).filter((text) => typeof text === "string" && text.length > 0);
}

function verbatimItems(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => ({ kind: "verbatim", text: line }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (REQUIRED_OPTIONS.some((name) => !options[name])) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  let original;
  let rewrite;
  try {
    original = readTextFile(options.original);
  } catch {
    console.error(`finish-check: cannot read ${options.original}`);
    process.exitCode = 2;
    return;
  }
  try {
    rewrite = readTextFile(options.rewrite);
  } catch {
    console.error(`finish-check: cannot read ${options.rewrite}`);
    process.exitCode = 2;
    return;
  }

  const missing = [];
  checkRequiredText(options.contract, missing);
  checkAudit(options.audit, missing);
  const verbatim = checkVerbatim(options.verbatim, missing);
  const approvedTexts = checkApprovals(options.approvals, missing);

  const exact = extractExactText(original);
  const items = [
    ...exact.fenced.map((text) => ({ kind: "fenced", text })),
    ...exact.inline.map((text) => ({ kind: "inline", text })),
    ...(verbatim === null ? [] : verbatimItems(verbatim)),
  ];
  const dropped = droppedItems(items, rewrite, approvedTexts);

  const ok = missing.length === 0 && dropped.length === 0;
  console.log(
    JSON.stringify({
      ok,
      missing,
      dropped: dropped.map((item) => ({ kind: item.kind, text: item.text.slice(0, DROP_TEXT_LIMIT) })),
    }),
  );
  process.exitCode = ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
