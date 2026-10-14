#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { readFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
import { parseArgs } from "../../../lib/args.mjs";
import { normalizeGitHubHierarchy, normalizeGitHubReviewThreads, redactSecrets } from "./lib/fix-support.mjs";

const SELECTION_SEPARATOR = /[\s,]+/;
const USAGE = [
  "Usage:",
  "  fix-support.mjs normalize-github-comments --input=<response.json> [--selected=<GH ids>]",
  "  fix-support.mjs normalize-github-hierarchy --input=<issue.json>",
  "  fix-support.mjs redact-context --input=<context.json>",
].join("\n");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function selectedIds(value = "") {
  return value
    .split(SELECTION_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

const COMMANDS = {
  "normalize-github-comments": (args) => normalizeGitHubReviewThreads(readJson(args.input), selectedIds(args.selected)),
  "normalize-github-hierarchy": (args) => normalizeGitHubHierarchy(readJson(args.input)),
  "redact-context": (args) => redactSecrets(readJson(args.input)),
};

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
if (!(args?.input && COMMANDS[command])) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(3);
}
process.stdout.write(`${JSON.stringify(COMMANDS[command](args), null, 2)}\n`);
