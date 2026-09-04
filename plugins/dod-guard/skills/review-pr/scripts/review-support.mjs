#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { readFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
import {
  dedupeFindings,
  normalizeAzureHierarchy,
  normalizeGitHubHierarchy,
  normalizeReviewTarget,
  redactSecrets,
  validateFindingLines,
  writeAzureReport,
} from "./lib/review-support.mjs";

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

function emit(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const [command, ...values] = process.argv.slice(2);
const args = argumentsByName(values);

if (command === "normalize-target") {
  emit(normalizeReviewTarget(args.input ?? "", args["current-branch"]));
} else if (command === "normalize-github-hierarchy") {
  emit(normalizeGitHubHierarchy(readJson(args.issue)));
} else if (command === "normalize-azure-hierarchy") {
  emit(normalizeAzureHierarchy(readJson(args.parent), readJson(args.children)));
} else if (command === "redact-context") {
  emit(redactSecrets(readJson(args.input)));
} else if (command === "validate-findings") {
  emit(validateFindingLines(readJson(args.findings), readFileSync(args.diff, "utf8"), args["allow-pr-level"] === "true"));
} else if (command === "dedupe-findings") {
  emit(dedupeFindings(readJson(args.findings)));
} else if (command === "render-azure") {
  const findings = dedupeFindings(readJson(args.findings));
  writeAzureReport(args.output, readJson(args.context), findings);
  emit({ findings: findings.length, output: args.output });
} else {
  throw new Error(`Unknown command: ${command ?? ""}`);
}
