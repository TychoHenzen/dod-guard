#!/usr/bin/env node
// Prints the next-ticket implementation handoff comment from an issue body's
// planned records and an evidence file, so the observed matrix JSON is encoded
// by JSON.stringify and never hand-written.
//
// Usage: node handoff-build.mjs --body-file=<issue-body.md> --evidence-file=<evidence.json> --head-sha=<sha>
//
// handoff-comment.mjs builds the text and handoff-evidence-problems.mjs defines
// the evidence file. stdout is the comment text, which post-push reads as the
// handoff file. stderr lists each problem, one per line, and nothing is printed
// on stdout then. Exit status: 0 built, 1 problems in the body or evidence, 2
// usage error.
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { build } from "./handoff-comment.mjs";
import { isPlainObject } from "./handoff-evidence-problems.mjs";
import { readText, UsageError } from "./handoff-proof-cli.mjs";

const USAGE =
  "usage: node handoff-build.mjs --body-file=<issue-body.md> --evidence-file=<evidence.json> --head-sha=<sha>\n";

const OPTIONS = Object.freeze({ "body-file": "issue-body.md", "evidence-file": "evidence.json", "head-sha": "sha" });

// An option given without a value parses as "true" or "", and neither names a
// file or a head.
function hasValue(options, name) {
  return Boolean(options[name]) && options[name] !== "true";
}

function optionsFrom(argv) {
  const options = parseArgs(argv);
  if (options === null) {
    throw new UsageError("options must be --name=value flags");
  }
  const unknown = Object.keys(options).find((name) => !Object.hasOwn(OPTIONS, name));
  if (unknown) {
    throw new UsageError(`unknown option --${unknown}`);
  }
  const missing = Object.entries(OPTIONS).find(([name]) => !hasValue(options, name));
  if (missing) {
    throw new UsageError(`--${missing[0]}=<${missing[1]}> is required`);
  }
  return options;
}

function readEvidence(file) {
  let evidence;
  try {
    evidence = JSON.parse(readText(file, "evidence-file"));
  } catch (error) {
    if (error instanceof UsageError) {
      throw error;
    }
    throw new UsageError("--evidence-file is not valid JSON", { cause: error });
  }
  if (!(Array.isArray(evidence?.tasks) && isPlainObject(evidence?.rows))) {
    throw new UsageError("--evidence-file must hold tasks[] and rows{}");
  }
  return evidence;
}

function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let result;
  try {
    const options = optionsFrom(argv);
    const body = readText(options["body-file"], "body-file");
    const evidence = readEvidence(options["evidence-file"]);
    result = build({ body, evidence, headSha: options["head-sha"] });
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
