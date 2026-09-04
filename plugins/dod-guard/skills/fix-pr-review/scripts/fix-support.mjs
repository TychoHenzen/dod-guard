#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { readFileSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
import {
  normalizeGitHubHierarchy,
  normalizeGitHubReviewThreads,
  parseAzureReport,
  redactSecrets,
  updateAzureReport,
} from "./lib/fix-support.mjs";

const SELECTION_SEPARATOR = /[\s,]+/;

function argumentsByName(argumentValues) {
  const result = {};
  for (let index = 0; index < argumentValues.length; index += 2) {
    const name = argumentValues[index];
    if (!name?.startsWith("--") || argumentValues[index + 1] === undefined) {
      throw new Error(`Invalid argument: ${name ?? ""}`);
    }
    result[name.slice(2)] = argumentValues[index + 1];
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function selectedIds(value = "") {
  return value
    .split(SELECTION_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const [command, ...values] = process.argv.slice(2);
const args = argumentsByName(values);

if (command === "normalize-github-comments") {
  emit(normalizeGitHubReviewThreads(readJson(args.input), selectedIds(args.selected)));
} else if (command === "parse-azure-report") {
  emit(parseAzureReport(readFileSync(args.input, "utf8"), selectedIds(args.selected)));
} else if (command === "normalize-github-hierarchy") {
  emit(normalizeGitHubHierarchy(readJson(args.input)));
} else if (command === "redact-context") {
  emit(redactSecrets(readJson(args.input)));
} else if (command === "update-azure-report") {
  const report = readFileSync(args.input, "utf8");
  writeFileSync(args.output ?? args.input, updateAzureReport(report, readJson(args.resolutions)), "utf8");
  emit({ output: args.output ?? args.input });
} else {
  throw new Error(`Unknown command: ${command ?? ""}`);
}
