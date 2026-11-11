#!/usr/bin/env node
// Classifies the issue branch that "Resume" in next-ticket finds, from the issue's comments and the branch tip.
//   live-handoff: the newest handoff by the author names the tip, so submit-draft-pr owns the issue.
//   superseded:   the branch holds work and a step plan was replaced after the tip, so the design moved on.
//   resumable:    anything else; the work continues on the branch.
//
// Usage: node resume-state.mjs --comments-file=<comments.json> --author=<login> --tip=<sha>
//   --tip-date=<iso> --ahead=<n>
// --comments-file holds `gh api --paginate --slurp repos/<owner>/<repo>/issues/<n>/comments` (pages) or one plain
// array. --tip-date is the committer date of the tip. --ahead counts the commits of origin/<default>..<tip>.
// stdout is one JSON line {"state","reason"}. Exit status: 0 classified, 2 usage error or unreadable comments.
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { readFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { classify } from "./resume-state-classify.mjs";

const OPTIONS = ["comments-file", "author", "tip", "tip-date", "ahead"];
const FLAGS = OPTIONS.map((name) => `--${name}=<value>`).join(" ");
const USAGE = `usage: node resume-state.mjs ${FLAGS}\n`;

function optionsOf(argv) {
  const options = parseArgs(argv);
  const complete = options !== null && OPTIONS.every((name) => options[name] && options[name] !== "true");
  const ahead = Number(options?.ahead);
  const valid = complete && Number.isInteger(ahead) && ahead >= 0 && !Number.isNaN(Date.parse(options["tip-date"]));
  return valid ? options : null;
}

function readComments(file) {
  const comments = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(comments)) {
    throw new Error("--comments-file must hold a JSON array");
  }
  return comments.flat(1);
}

function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const options = optionsOf(argv);
    if (options === null) {
      throw new Error("every option is required, --ahead is a count and --tip-date a date");
    }
    const comments = readComments(options["comments-file"]);
    const input = { comments, login: options.author, tip: options.tip, tipDate: options["tip-date"] };
    stdout.write(`${JSON.stringify(classify({ ...input, ahead: Number(options.ahead) }))}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n${USAGE}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}

export { runCli };
