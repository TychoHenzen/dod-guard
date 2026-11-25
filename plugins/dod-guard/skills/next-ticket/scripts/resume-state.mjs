#!/usr/bin/env node
// Classifies the issue branch that "Resume" in next-ticket finds, from the issue's comments and the branch tip that
// holds the newest work.
//   live-handoff: the newest handoff by the author names the tip, so submit-draft-pr owns the issue.
//   superseded:   the branch holds work and a step plan was replaced after the tip, so the design moved on.
//   resumable:    anything else; the work continues on the branch.
//
// Usage: node resume-state.mjs --comments-file=<comments.json> --author=<login> --tip=<sha>
//   --tip-date=<iso> --ahead=<n> [--local-tip=<sha> --local-tip-date=<iso> --local-ahead=<n>
//   --unpushed=<n> --behind=<n>]
// --comments-file holds `gh api --paginate --slurp repos/<owner>/<repo>/issues/<n>/comments` (pages) or one plain
// array. --tip, --tip-date and --ahead describe origin/<branch>: its sha, its committer date, and the commit count of
// origin/<default>..origin/<branch>. The --local-* flags describe the local branch the same way, --unpushed counts
// origin/<branch>..<branch> and --behind counts <branch>..origin/<branch>; pass all five or none. A local branch
// ahead of its origin is the tip classified. A diverged branch is an error.
// stdout is one JSON line {"state","reason"}. Exit status: 0 classified, 2 usage error, unreadable comments, or a
// diverged branch.
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { readFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This CLI runs under Node.js.
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { classify, pickTip } from "./resume-state-classify.mjs";

const OPTIONS = ["comments-file", "author", "tip", "tip-date", "ahead"];
const LOCAL_OPTIONS = ["local-tip", "local-tip-date", "local-ahead", "unpushed", "behind"];
const flags = (names) => names.map((name) => `--${name}=<value>`).join(" ");
const USAGE = `usage: node resume-state.mjs ${flags(OPTIONS)} [${flags(LOCAL_OPTIONS)}]\n`;

const given = (options, name) => Boolean(options[name]) && options[name] !== "true";
const isCount = (value) => Number.isInteger(Number(value)) && Number(value) >= 0;
const isDate = (value) => !Number.isNaN(Date.parse(value));

function hasValidOrigin(options) {
  return OPTIONS.every((name) => given(options, name)) && isCount(options.ahead) && isDate(options["tip-date"]);
}

function hasValidLocal(options) {
  const counts = ["local-ahead", "unpushed", "behind"].every((name) => isCount(options[name]));
  return LOCAL_OPTIONS.every((name) => given(options, name)) && counts && isDate(options["local-tip-date"]);
}

function optionsOf(argv) {
  const options = parseArgs(argv);
  const hasLocal = options !== null && LOCAL_OPTIONS.some((name) => given(options, name));
  if (options === null || !hasValidOrigin(options) || (hasLocal && !hasValidLocal(options))) {
    throw new Error("every option is required, the local ones all or none; counts are counts and dates dates");
  }
  return { options, hasLocal };
}

function workTip({ options, hasLocal }) {
  const origin = { tip: options.tip, tipDate: options["tip-date"], ahead: Number(options.ahead) };
  if (!hasLocal) {
    return origin;
  }
  const [tip, tipDate, ahead] = [options["local-tip"], options["local-tip-date"], Number(options["local-ahead"])];
  return pickTip(origin, { tip, tipDate, ahead, unpushed: Number(options.unpushed), behind: Number(options.behind) });
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
    const parsed = optionsOf(argv);
    const tip = workTip(parsed);
    const comments = readComments(parsed.options["comments-file"]);
    stdout.write(`${JSON.stringify(classify({ comments, login: parsed.options.author, ...tip }))}\n`);
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
