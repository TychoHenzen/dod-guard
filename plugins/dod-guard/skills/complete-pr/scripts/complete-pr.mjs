#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
import { requireRepositoryCheckout } from "./lib/checkout-guard.mjs";
import { parseArguments } from "./lib/cli-args.mjs";
import { completePullRequest } from "./lib/complete-pr.mjs";
import { GitHubClient } from "./lib/github-client.mjs";
import { LocalGit } from "./lib/local-git.mjs";
import { recoverMergedPullRequest } from "./lib/merged-recovery.mjs";
import { buildStopReport } from "./lib/stop-report.mjs";

const USAGE = [
  "Usage: node complete-pr.mjs <owner/repository> <pull-request-number>",
  "--pushed-head <verified-head-sha> | [--recover-merged [--dry-run]]",
  "[--repo-dir <checkout>]\n",
].join(" ");

// The checkout guard runs first, so a wrong directory stops before any GitHub request.
function run(invocation) {
  const { dryRun, pullNumber, pushedHead, recoverMerged, repoDir, repository } = invocation;
  if (repoDir) {
    process.chdir(repoDir);
  }
  const localGit = new LocalGit();
  requireRepositoryCheckout(repository, localGit, process.cwd());
  const client = new GitHubClient(repository, pullNumber);
  if (recoverMerged) {
    return recoverMergedPullRequest(client, { dryRun, localGit });
  }
  return completePullRequest(client, { localGit, pushedHead });
}

function reportFailure(error) {
  let code = "";
  if (error.code) {
    code = ` [${error.code}]`;
  }
  process.stderr.write(`complete-pr failed${code}: ${error.message}\n`);
  process.stdout.write(`${JSON.stringify(buildStopReport(error), null, 2)}\n`);
  process.exitCode = 1;
}

const request = parseArguments(process.argv.slice(2));
if (request) {
  try {
    process.stdout.write(`${JSON.stringify(await run(request), null, 2)}\n`);
  } catch (error) {
    reportFailure(error);
  }
} else {
  process.stderr.write(USAGE);
  process.exitCode = 2;
}
