#!/usr/bin/env node
// Names the one current `## Implementation handoff` comment on an issue and writes the demoted text of every
// older one, so a stale handoff is never the record that survives and complete-pr finds exactly one.
//
// Usage: node handoff-select.mjs --comments-file=<comments.json> --author=<login> --output-dir=<dir>
//
// --comments-file holds the output of `gh api --paginate --slurp repos/<owner>/<repo>/issues/<n>/comments`
// (an array of pages) or one plain array. --author is the authenticated login (`gh api user --jq .login`).
// The newest handoff by creation time is kept. Each older one is written to <output-dir>/superseded-<id>.md.
// stdout is one JSON line: {"keep":{"id":N},"superseded":[{"id":N,"file":"..."}],"ignored":[N]}. Patch each listed
// comment with its file, then read the comments back. Exit status: 0 planned, 1 no handoff by the author or a
// malformed one (stderr names each), 2 usage error.
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { mkdirSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { selectHandoff } from "../../../lib/handoff-comments.mjs";
import { readText, UsageError } from "./handoff-proof-cli.mjs";

const USAGE = "usage: node handoff-select.mjs --comments-file=<comments.json> --author=<login> --output-dir=<dir>\n";
const OPTIONS = Object.freeze({ "comments-file": "comments.json", author: "login", "output-dir": "dir" });

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

function readComments(file) {
  let comments;
  try {
    comments = JSON.parse(readText(file, "comments-file"));
  } catch (error) {
    throw error instanceof UsageError ? error : new UsageError("--comments-file is not valid JSON", { cause: error });
  }
  if (!Array.isArray(comments)) {
    throw new UsageError("--comments-file must hold a JSON array");
  }
  return comments.flat(1);
}

function writeSuperseded(plan, dir) {
  mkdirSync(dir, { recursive: true });
  return plan.superseded.map(({ id, body }) => {
    const file = path.join(dir, `superseded-${id}.md`);
    writeFileSync(file, body, "utf8");
    return { id, file };
  });
}

function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let plan;
  let options;
  try {
    options = optionsFrom(argv);
    plan = selectHandoff(readComments(options["comments-file"]), options.author);
  } catch (error) {
    if (!(error instanceof UsageError)) {
      throw error;
    }
    stderr.write(`${error.message}\n${USAGE}`);
    return 2;
  }
  if (plan.errors) {
    stderr.write(plan.errors.map((message) => `${message}\n`).join(""));
    return 1;
  }
  const superseded = writeSuperseded(plan, options["output-dir"]);
  stdout.write(`${JSON.stringify({ keep: plan.keep, superseded, ignored: plan.ignored })}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}

export { runCli };
