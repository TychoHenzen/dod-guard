#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";
import { readTextFile } from "../../../lib/read-text.mjs";
import { droppedItems, extractExactText, verbatimItems } from "./exact-text.mjs";
import { checkApprovals, checkAudit, checkRequiredText, readExisting } from "./finish-check-files.mjs";

const USAGE = [
  "usage: finish-check.mjs --original=<path> --rewrite=<path> --contract=<path>",
  "--verbatim=<path> --approvals=<path> --audit=<path>",
].join(" ");
const REQUIRED_OPTIONS = ["original", "rewrite", "contract", "verbatim", "approvals", "audit"];
const DROP_TEXT_LIMIT = 200;

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) options[match[1]] = match[2];
  }
  return options;
}

// Returns the file text, or null after reporting that it cannot be read.
function readOrReport(path) {
  try {
    return readTextFile(path);
  } catch {
    console.error(`finish-check: cannot read ${path}`);
    return null;
  }
}

function report(missing, dropped) {
  const ok = missing.length === 0 && dropped.length === 0;
  console.log(
    JSON.stringify({
      ok,
      missing,
      dropped: dropped.map((item) => ({ kind: item.kind, text: item.text.slice(0, DROP_TEXT_LIMIT) })),
    }),
  );
  return ok ? 0 : 1;
}

// Returns { original, rewrite }, or null after reporting the first one that cannot be read.
function readTexts(options) {
  const original = readOrReport(options.original);
  if (original === null) return null;
  const rewrite = readOrReport(options.rewrite);
  return rewrite === null ? null : { original, rewrite };
}

function exactItems(original, verbatim) {
  const exact = extractExactText(original);
  return [
    ...exact.fenced.map((text) => ({ kind: "fenced", text })),
    ...exact.inline.map((text) => ({ kind: "inline", text })),
    ...(verbatim === null ? [] : verbatimItems(verbatim)),
  ];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (REQUIRED_OPTIONS.some((name) => !options[name])) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const texts = readTexts(options);
  if (texts === null) {
    process.exitCode = 2;
    return;
  }

  const missing = [];
  checkRequiredText(options.contract, missing);
  checkAudit(options.audit, missing);
  const verbatim = readExisting(options.verbatim, missing, "missing");
  const approvedTexts = checkApprovals(options.approvals, missing);
  const items = exactItems(texts.original, verbatim);
  process.exitCode = report(missing, droppedItems(items, texts.rewrite, approvedTexts));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
