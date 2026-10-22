#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This skill helper starts the quality-guard scanner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { closeSync, existsSync, openSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
import { parseArgs } from "../../../lib/args.mjs";
import { readJsonFile, readTextFile } from "../../../lib/read-text.mjs";
import { candidates, pbiInputs, violations } from "./lib/candidate-commands.mjs";
import { ignoredPaths, scanArguments } from "./lib/ignored-paths.mjs";
import { buildReview, existingReview, postedFindings } from "./lib/review-findings.mjs";
import { reviewSlots } from "./lib/review-slots.mjs";
import { scannerPath } from "./lib/scanner-location.mjs";
import { parseChangedLines } from "./lib/unified-diff.mjs";

const USAGE = [
  "Usage:",
  "  review-findings.mjs scan --client=claude|codex --registry=<plugin-list.json>",
  "    --root=<repo> --out=<scan.json>",
  "  review-findings.mjs existing --reviews=<reviews.json>",
  "  review-findings.mjs slots --diff=<unified0.diff> --pbi=<issue.json>",
  "    --sub-issues=<sub-issues.json> --out=<slots.json>",
  "  review-findings.mjs violations --scan=<scan.json> --diff=<unified0.diff>",
  "    --out=<violations.json>",
  "  review-findings.mjs candidates --scan=<scan.json> --diff=<unified0.diff> --pbi=<issue.json>",
  "    --sub-issues=<sub-issues.json> --plan=<plan.json> --results=<results.json>",
  "    --out=<candidates.json>",
  "  review-findings.mjs build --head=<sha> --scan=<scan.json> --diff=<unified0.diff>",
  "    --pbi=<issue.json> --sub-issues=<sub-issues.json> --plan=<plan.json>",
  "    --results=<results.json> --merge=<merge.json> --out=<payload.json>",
  "  review-findings.mjs report --review-id=<id> --comments=<review-comments.json>",
].join("\n");

// `gh api --paginate --slurp` writes an array of pages; a plain read writes one
// array.
function flatJson(path) {
  return readJsonFile(path).flat();
}

function slotCounts(slots) {
  const count = (kind) => slots.filter((slot) => slot.kind === kind).length;
  return {
    files: count("file"),
    criteria: count("criterion"),
    subIssues: count("sub-issue"),
  };
}

// The whole-repository report runs to megabytes, so it goes straight to a file
// instead of through a pipe.
function scan(args) {
  const scanner = scannerPath(args.client, readJsonFile(args.registry));
  if (!existsSync(scanner)) {
    throw new Error(`quality-guard scanner not found at ${scanner}`);
  }
  const out = openSync(args.out, "w");
  const result = spawnSync(process.execPath, [scanner, ...scanArguments(args.root, ignoredPaths(args.root))], {
    cwd: args.root,
    stdio: ["ignore", out, "pipe"],
    shell: false,
  });
  closeSync(out);
  if (result.error || result.status !== 0) {
    throw new Error(`quality-scan failed (${result.status}): ${result.error?.message ?? result.stderr}`);
  }
  return {
    scanner,
    out: args.out,
    violations: readJsonFile(args.out).violations.length,
  };
}

const COMMANDS = {
  scan,
  existing: (args) => existingReview(flatJson(args.reviews)),
  slots: (args) => {
    const slots = reviewSlots({
      changedLines: parseChangedLines(readTextFile(args.diff)),
      ...pbiInputs(args),
    });
    writeFileSync(args.out, `${JSON.stringify(slots, null, 2)}\n`);
    return { out: args.out, slots: slots.length, ...slotCounts(slots) };
  },
  violations,
  candidates,
  build: (args) => {
    const review = buildReview({
      headSha: args.head,
      scan: readJsonFile(args.scan),
      diff: readTextFile(args.diff),
      results: readJsonFile(args.results),
      plan: readJsonFile(args.plan),
      merge: readJsonFile(args.merge),
      ...pbiInputs(args),
    });
    writeFileSync(args.out, JSON.stringify(review.payload));
    return {
      recommendation: review.recommendation,
      counts: review.counts,
      inline: review.payload.comments.length,
      payload: args.out,
    };
  },
  report: (args) => postedFindings(Number(args["review-id"]), flatJson(args.comments)),
};

const REQUIRED = {
  scan: ["client", "registry", "root", "out"],
  existing: ["reviews"],
  slots: ["diff", "pbi", "sub-issues", "out"],
  violations: ["scan", "diff", "out"],
  candidates: ["scan", "diff", "pbi", "sub-issues", "plan", "results", "out"],
  build: ["head", "scan", "diff", "pbi", "sub-issues", "plan", "results", "merge", "out"],
  report: ["review-id", "comments"],
};
const FULL_SHA = /^[0-9a-f]{40}$/;

// ASSUMPTION: no command takes an optional flag, so refusing every flag outside
// REQUIRED is safe. A misspelled or retired flag then stops with usage instead
// of being ignored.
function validArgs(command, args) {
  if (!(args && COMMANDS[command])) {
    return false;
  }
  if (REQUIRED[command].some((name) => !args[name] || args[name] === "true")) {
    return false;
  }
  if (!Object.keys(args).every((name) => REQUIRED[command].includes(name))) {
    return false;
  }
  // The marker reader only accepts a hex head, so a build with anything else
  // would post an undetectable review.
  return command !== "build" || FULL_SHA.test(args.head);
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
if (!validArgs(command, args)) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(3);
}
process.stdout.write(`${JSON.stringify(COMMANDS[command](args), null, 2)}\n`);
