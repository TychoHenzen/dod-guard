#!/usr/bin/env node
// The ordinary-path proof complete-pr runs before its merge helper. standards/project-workflow.md
// defines the ordinary path; lib/ordinary-proof.mjs holds the judgement.
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { REPOSITORY_NAME } from "../../../lib/repository-identity.mjs";
import { FULL_SHA } from "./lib/closure-completion.mjs";
import { positiveInteger } from "./lib/closure-options.mjs";
import { runGh } from "./lib/gh-runner.mjs";
import { ordinaryProof } from "./lib/ordinary-proof.mjs";

const USAGE = `usage: ordinary-proof.mjs --repository=<owner/name> --pull=<n> --head-sha=<sha>

Reads the open pull request and the one issue in the same repository that its body
closes, and prints one JSON object. Its outcome sorts the ticket:

  ordinary   exit 0  The issue carries no structured record, handoff or step plan
                     comment, and no sub-issues. The pull request head is --head-sha,
                     its ## Convergence holds "- Handoff: none, ordinary path", and its
                     ## Acceptance criteria checklist holds every criterion of the
                     issue's own checklist, checked, with no unchecked item.
  structured exit 3  The issue carries a structured record or comment (listed under
                     markers). The structured sections of complete-pr apply unchanged.
  refused    exit 1  Anything else; reasons lists each one.

Exit 2 is a usage error or a failed GitHub read. The proof writes nothing.`;

const EXIT_CODES = { ordinary: 0, refused: 1, structured: 3 };

function proofInputs(args) {
  const pull = positiveInteger(args?.pull);
  const headSha = args?.["head-sha"];
  if (!(pull && REPOSITORY_NAME.test(args.repository ?? "") && FULL_SHA.test(headSha ?? ""))) {
    return null;
  }
  return { repository: args.repository, pull, headSha };
}

function runCli(argv, { runner = runGh, stdout = process.stdout, stderr = process.stderr } = {}) {
  const inputs = proofInputs(parseArgs(argv));
  if (inputs === null) {
    stderr.write(`${USAGE}\n`);
    return 2;
  }
  try {
    const result = ordinaryProof({ ...inputs, runner });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return EXIT_CODES[result.outcome];
  } catch (error) {
    stderr.write(`ordinary-proof failed: ${error.message}\n`);
    return 2;
  }
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) {
  process.exitCode = runCli(process.argv.slice(2));
}

export { runCli };
