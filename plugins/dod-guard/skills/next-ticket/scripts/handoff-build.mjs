#!/usr/bin/env node
// Prints the next-ticket implementation handoff comment from an issue body's
// planned records and an evidence file, so the observed matrix JSON is encoded
// by JSON.stringify and never hand-written.
//
// Usage: node handoff-build.mjs --body-file=<issue-body.md> --evidence-file=<evidence.json> --head-sha=<sha>
//        [--previous-handoff-file=<handoff.md>] [--root=<checkout>]
//
// handoff-comment.mjs builds the text and handoff-evidence-problems.mjs defines
// the evidence file.
// --previous-handoff-file copies that handoff's ## Preflight checkpoint section into the new comment.
// --root names the checkout that an evidence carryForward is verified against.
// stdout is the comment text, which post-push reads as the handoff file. stderr
// lists each problem, one per line, and nothing is printed on stdout then. Exit
// status: 0 built, 1 problems in the body or evidence, 2 usage error.
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { fileURLToPath } from "node:url";
import { readBuildInput, USAGE } from "./handoff-build-options.mjs";
import { build } from "./handoff-comment.mjs";
import { UsageError } from "./handoff-proof-cli.mjs";

function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let result;
  try {
    result = build(readBuildInput(argv));
  } catch (error) {
    if (!(error instanceof UsageError)) {
      throw error;
    }
    stderr.write(`${error.message}\n${USAGE}`);
    return 2;
  }
  if (result.errors) {
    stderr.write(result.errors.map((message) => `${message}\n`).join(""));
    return 1;
  }
  stdout.write(result.text);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}

export { runCli };
