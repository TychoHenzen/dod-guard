#!/usr/bin/env node
// Posts the pull-request gate's comment (the --comment file quality-pr-gate.mjs wrote) as the one gate comment on the
// pull request, updating it on later pushes. Needs GH_TOKEN. Best effort: a token that cannot comment (forks,
// Dependabot) only produces a warning, so the gate's own verdict is never hidden by a comment failure.
// Usage: node quality-pr-gate-comment.mjs --repo=<owner/name> --pr=<number> --body=<file>
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { upsertComment } from "./lib/pr-gate-comment.mjs";

function parseArgs(argv) {
  const values = new Map(argv.map((arg) => arg.replace(/^--/, "").split(/=(.*)/s)));
  const missing = ["repo", "pr", "body"].find((name) => !values.get(name));
  return {
    repo: values.get("repo"),
    pr: values.get("pr"),
    bodyFile: values.get("body"),
    error: missing ? `missing --${missing}` : "",
  };
}

function gh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`gh ${args[0]} failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return result.stdout;
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.error) {
    process.stderr.write(`quality-pr-gate-comment: ${options.error}\n`);
    return 2;
  }
  try {
    upsertComment({ ...options, gh });
  } catch (error) {
    process.stderr.write(`quality-pr-gate-comment: could not post the comment: ${error.message}\n`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
