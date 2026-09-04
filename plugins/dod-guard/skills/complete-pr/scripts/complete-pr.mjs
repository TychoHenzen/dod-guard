#!/usr/bin/env node
import { completePullRequest } from "./lib/complete-pr.mjs";
import { GitHubClient } from "./lib/github-client.mjs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";

const [repository, pullNumberText] = process.argv.slice(2);
const pullNumber = Number.parseInt(pullNumberText, 10);

if (repository && Number.isInteger(pullNumber) && pullNumber > 0) {
  try {
    const result = await completePullRequest(new GitHubClient(repository, pullNumber));
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
  process.stderr.write("Usage: node complete-pr.mjs <owner/repository> <pull-request-number>\n");
  process.exitCode = 2;
}
