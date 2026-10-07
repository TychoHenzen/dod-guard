#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This skill helper starts the quality-guard scanner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
import { parseArgs } from "../../../lib/args.mjs";
import {
  buildReview,
  existingReview,
  postedFindings,
} from "./lib/review-findings.mjs";
import { scannerPath } from "./lib/scanner-location.mjs";

const USAGE = [
  "Usage:",
  "  review-findings.mjs scan --client=claude|codex --registry=<plugin-list.json> --root=<repo> --out=<scan.json>",
  "  review-findings.mjs existing --reviews=<reviews.json>",
  "  review-findings.mjs build --head=<sha> --scan=<scan.json>",
  "    --diff=<unified0.diff> --results=<results.json> --out=<payload.json>",
  "  review-findings.mjs report --review-id=<id> --comments=<review-comments.json>",
].join("\n");

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// `gh api --paginate --slurp` writes an array of pages; a plain read writes one
// array.
function flatJson(path) {
  return json(path).flat();
}

// The whole-repository report runs to megabytes, so it goes straight to a file
// instead of through a pipe.
function scan(args) {
  const scanner = scannerPath(args.client, json(args.registry));
  if (!existsSync(scanner)) {
    throw new Error(`quality-guard scanner not found at ${scanner}`);
  }
  const out = openSync(args.out, "w");
  const result = spawnSync(
    process.execPath,
    [scanner, ".", `--root=${args.root}`, "--format=json"],
    {
      cwd: args.root,
      stdio: ["ignore", out, "pipe"],
      shell: false,
    },
  );
  closeSync(out);
  if (result.error || result.status !== 0) {
    throw new Error(
      `quality-scan failed (${result.status}): ${result.error?.message ?? result.stderr}`,
    );
  }
  return {
    scanner,
    out: args.out,
    violations: json(args.out).violations.length,
  };
}

const COMMANDS = {
  scan,
  existing: (args) => existingReview(flatJson(args.reviews)),
  build: (args) => {
    const review = buildReview({
      headSha: args.head,
      scan: json(args.scan),
      diff: readFileSync(args.diff, "utf8"),
      results: json(args.results),
    });
    writeFileSync(args.out, JSON.stringify(review.payload));
    return {
      recommendation: review.recommendation,
      counts: review.counts,
      inline: review.payload.comments.length,
      payload: args.out,
    };
  },
  report: (args) =>
    postedFindings(Number(args["review-id"]), flatJson(args.comments)),
};

const REQUIRED = {
  scan: ["client", "registry", "root", "out"],
  existing: ["reviews"],
  build: ["head", "scan", "diff", "results", "out"],
  report: ["review-id", "comments"],
};
const FULL_SHA = /^[0-9a-f]{40}$/;

// The marker reader only accepts a hex head, so a build with anything else
// would post an undetectable review.
function validArgs(command, args) {
  if (!(args && COMMANDS[command])) {
    return false;
  }
  if (REQUIRED[command].some((name) => !args[name] || args[name] === "true")) {
    return false;
  }
  return command !== "build" || FULL_SHA.test(args.head);
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
if (!validArgs(command, args)) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(3);
}
process.stdout.write(`${JSON.stringify(COMMANDS[command](args), null, 2)}\n`);
