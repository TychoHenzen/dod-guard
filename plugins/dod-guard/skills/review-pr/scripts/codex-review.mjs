#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This skill helper invokes the local GitHub CLI from Node.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
import { numberArg, parseArgs } from "../../../lib/args.mjs";
import { codexReviewState } from "./lib/codex-review-state.mjs";

const USAGE = "Usage: codex-review.mjs --repo=<owner/name> --pr=<number> [--waited-ms=<n>] [--post-trigger]";
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function gh(ghArgs) {
  const result = spawnSync("gh", ghArgs, { encoding: "utf8", windowsHide: true });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`gh ${ghArgs.join(" ")} failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  return JSON.parse(result.stdout);
}

function pages(endpoint) {
  return gh(["api", "--paginate", "--slurp", `${endpoint}?per_page=100`]).flat();
}

function readState(repository, number, waitedMs) {
  const pull = `repos/${repository}/pulls/${number}`;
  const issue = `repos/${repository}/issues/${number}`;
  return codexReviewState({
    pullRequest: gh(["api", pull]),
    issueComments: pages(`${issue}/comments`),
    reviews: pages(`${pull}/reviews`),
    reviewComments: pages(`${pull}/comments`),
    reactions: pages(`${issue}/reactions`),
    waitedMs,
  });
}

const args = parseArgs(process.argv.slice(2));
const pullNumber = numberArg(args, "pr", Number.NaN);
if (!(args && REPOSITORY.test(args.repo ?? "") && Number.isInteger(pullNumber))) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(3);
}

let state = readState(args.repo, pullNumber, numberArg(args, "waited-ms", 0));
if (args["post-trigger"] === "true" && state.action === "trigger") {
  gh(["api", "--method", "POST", `repos/${args.repo}/issues/${pullNumber}/comments`, "-f", `body=${state.command}`]);
  state = { ...readState(args.repo, pullNumber, 0), triggerPosted: true };
}
process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
