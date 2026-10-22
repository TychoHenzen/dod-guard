#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
import { completePullRequest } from "./lib/complete-pr.mjs";
import { GitHubClient } from "./lib/github-client.mjs";
import { LocalGit } from "./lib/local-git.mjs";
import { recoverMergedPullRequest } from "./lib/merged-recovery.mjs";
import { buildStopReport } from "./lib/stop-report.mjs";

const [repository, pullNumberText, ...flags] = process.argv.slice(2);
const pullNumber = Number.parseInt(pullNumberText, 10);
const recoveryMode = flags.includes("--recover-merged");
const dryRun = flags.includes("--dry-run");
let pushedHead = null;
const [firstFlag, firstFlagValue] = flags;
if (firstFlag === "--pushed-head") {
  pushedHead = firstFlagValue;
}
const validPushedHead = typeof pushedHead === "string" && /^[0-9a-f]{40}$/i.test(pushedHead);
let validFlags;
if (recoveryMode) {
  validFlags = flags.length === 1 || (flags.length === 2 && dryRun);
} else {
  validFlags = flags.length === 2 && flags[0] === "--pushed-head" && validPushedHead;
}

if (repository && Number.isInteger(pullNumber) && pullNumber > 0 && validFlags) {
  try {
    const client = new GitHubClient(repository, pullNumber);
    const localGit = new LocalGit();
    let result;
    if (recoveryMode) {
      result = await recoverMergedPullRequest(client, { dryRun, localGit });
    } else {
      result = await completePullRequest(client, { localGit, pushedHead });
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    let code = "";
    if (error.code) {
      code = ` [${error.code}]`;
    }
    process.stderr.write(`complete-pr failed${code}: ${error.message}\n`);
    process.stdout.write(`${JSON.stringify(buildStopReport(error), null, 2)}\n`);
    process.exitCode = 1;
  }
} else {
  process.stderr.write(
    [
      "Usage: node complete-pr.mjs <owner/repository> <pull-request-number>",
      "--pushed-head <verified-head-sha> | [--recover-merged [--dry-run]]\n",
    ].join(" "),
  );
  process.exitCode = 2;
}
