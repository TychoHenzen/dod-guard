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
import { createReviewEvidenceSnapshot, readReviewEvidenceSnapshot } from "./lib/review-evidence-snapshot.mjs";
import { buildDispatchInput } from "./lib/review-prompts.mjs";
import { REVIEWERS, planReviewUnits } from "./lib/review-units.mjs";
import { validateReviewContext, validateReviewerResult } from "./lib/review-validation.mjs";

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

// Findings are only valid for the head the reviewers read; a moved head needs a new review.
function requireSameHead(reviewed, current) {
  if (!reviewed || reviewed !== current) {
    throw new Error(`Pull request head moved from ${reviewed ?? "<missing>"} to ${current ?? "<missing>"}; do not publish.`);
  }
}

function readDispatchInput(context, units, executable) {
  const contents = readReviewEvidenceSnapshot(context.finalFileAccess);
  const agents = Object.fromEntries(
    REVIEWERS.map((name) => [name, readFileSync(new URL(`../../../agents/${name}.md`, import.meta.url), "utf8")]),
  );
  const input = buildDispatchInput({ context, units, contents, diff: readFileSync(context.diffFile, "utf8"), agents });
  if (!executable) {
    return input;
  }
  return { executable, ...input };
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
} else if (command === "validate-context") {
  emit(validateReviewContext(readJson(args.input)));
} else if (command === "validate-review-result") {
  const context = validateReviewContext(readJson(args.context));
  emit(validateReviewerResult(readJson(args.input), args.reviewer, context.reviewRequirements, args.unit));
} else if (command === "validate-findings") {
  emit(validateFindingLines(readJson(args.findings), readFileSync(args.diff, "utf8"), args["allow-pr-level"] === "true"));
} else if (command === "dedupe-findings") {
  emit(dedupeFindings(readJson(args.findings)));
} else if (command === "render-azure") {
  const findings = dedupeFindings(readJson(args.findings));
  writeAzureReport(args.output, readJson(args.context), findings);
  emit({ findings: findings.length, output: args.output });
} else if (command === "plan-review-units") {
  const input = readJson(args.input);
  emit(planReviewUnits(input.changedFiles, input.allFiles));
} else if (command === "build-dispatch-input") {
  emit(readDispatchInput(readJson(args.context), readJson(args.units), args.executable));
} else if (command === "check-head") {
  requireSameHead(args.reviewed, args.current);
  emit({ headSha: args.current, unchanged: true });
} else if (command === "snapshot-files") {
  emit(createReviewEvidenceSnapshot(readJson(args.input)));
} else {
  throw new Error(`Unknown command: ${command ?? ""}`);
}
