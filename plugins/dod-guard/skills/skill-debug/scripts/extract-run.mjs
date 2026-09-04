#!/usr/bin/env node
// One run of one skill, compacted to a numbered trace.
//
// This is the evidence a skill edit has to cite. Reading the raw transcript
// instead costs more context than the run being debugged. It also feeds the
// model its own reasoning back, which then reads as fact.

import { numberArg, parseArgs } from "../../../lib/args.mjs";
import { normalizeSkill } from "./lib/invocations.mjs";
import { readRecords } from "./lib/records.mjs";
import { renderTrace } from "./lib/render.mjs";
import { findRuns } from "./lib/runs.mjs";
import { projectsRoot, resolveSession } from "./lib/sessions.mjs";
import { traceOf } from "./lib/trace.mjs";

const USAGE = [
  "Usage: node extract-run.mjs --session=<id> --skill=<name> [options]",
  "",
  "  --session=<id>    session id, a unique prefix, or a path",
  "  --skill=<name>    bare or qualified, /tighten or dod-guard:tighten",
  "  --run=<n>         which run in that session, default 1",
  "  --max-steps=<n>   cap on printed steps, default 400",
  "  --sidechains      include subagent steps, marked with ~",
  "  --projects=<dir>  transcript root, default Claude projects and Codex sessions",
  "",
  "Exit codes: 0 trace printed, 4 no such run, 3 usage error.",
].join("\n");

function options(args) {
  return {
    sidechains: args.sidechains === "true",
    maxSteps: numberArg(args, "max-steps", 400),
  };
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args?.session || !args?.skill) {
    process.stderr.write(`${USAGE}\n`);
    return 3;
  }
  const found = resolveSession(projectsRoot(args), args.session);
  if (!found) {
    process.stderr.write(`no transcript matching ${args.session}\n`);
    return 4;
  }
  const skill = normalizeSkill(args.skill);
  const records = readRecords(found.path);
  const runs = findRuns(records, skill);
  const run = runs[numberArg(args, "run", 1) - 1];
  if (!run) {
    process.stderr.write(`${runs.length} runs of ${skill} in that session\n`);
    return 4;
  }
  const trace = traceOf(records, run, options(args));
  process.stdout.write(`${renderTrace(run, trace)}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
