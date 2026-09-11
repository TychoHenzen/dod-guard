#!/usr/bin/env node
import { completePullRequest, recoverMergedPullRequest } from "./lib/complete-pr.mjs";
import { GitHubClient } from "./lib/github-client.mjs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";

const [repository, pullNumberText, ...flags] = process.argv.slice(2);
const pullNumber = Number.parseInt(pullNumberText, 10);
const recoveryMode = flags.includes("--recover-merged");
const dryRun = flags.includes("--dry-run");
const validFlags = flags.length === 0 || (recoveryMode && (flags.length === 1 || (flags.length === 2 && dryRun)));

if (repository && Number.isInteger(pullNumber) && pullNumber > 0 && validFlags) {
  try {
    const client = new GitHubClient(repository, pullNumber);
    let result;
    if (recoveryMode) {
      result = await recoverMergedPullRequest(client, { dryRun });
    } else {
      result = await completePullRequest(client);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    let code = "";
    if (error.code) {
      code = ` [${error.code}]`;
    }
    process.stderr.write(`complete-pr failed${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
} else {
  process.stderr.write(
    "Usage: node complete-pr.mjs <owner/repository> <pull-request-number> [--recover-merged [--dry-run]]\n",
  );
  process.exitCode = 2;
}
