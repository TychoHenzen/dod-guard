#!/usr/bin/env node
// Every recent run of one skill, newest first.
//
// Debugging a skill starts with knowing whether it has misbehaved once or five
// times. One run is an anecdote. The same divergence in three runs is the skill
// text, and only the second of those is worth editing a SKILL.md over.

import { readFileSync } from "node:fs";
import { numberArg, parseArgs } from "../../../lib/args.mjs";
import { normalizeSkill } from "./lib/invocations.mjs";
import { parseRecords } from "./lib/records.mjs";
import { renderRunIndex } from "./lib/render.mjs";
import { findRuns } from "./lib/runs.mjs";
import { listTranscripts, projectsRoot } from "./lib/sessions.mjs";
import { traceOf } from "./lib/trace.mjs";

const USAGE = [
  "Usage: node find-runs.mjs --skill=<name> [options]",
  "",
  "  --skill=<name>    bare or qualified, /tighten or dod-guard:tighten",
  "  --days=<n>        how far back to scan, default 30",
  "  --limit=<n>       how many runs to list, default 8",
  "  --projects=<dir>  transcript root, default ~/.claude/projects",
  "",
  "Exit codes: 0 runs listed, 4 no run found, 3 usage error.",
].join("\n");

// A transcript that never spells the name cannot hold a run of it. Skipping
// the parse on those is the whole cost of this scan. One file reaches
// megabytes, and most projects never touched the skill.
function runsInFile(entry, skill) {
  const text = readFileSync(entry.path, "utf8");
  if (!text.includes(skill)) {
    return [];
  }
  const records = parseRecords(text);
  return findRuns(records, skill).map((run) => ({
    ...run,
    session: entry.session,
    project: entry.project,
    path: entry.path,
    counts: traceOf(records, run).counts,
  }));
}

function byNewest(left, right) {
  const right_at = String(right.timestamp ?? "");
  return right_at.localeCompare(String(left.timestamp ?? ""));
}

function collect(root, skill, options) {
  const rows = listTranscripts(root, options.days).flatMap((entry) =>
    runsInFile(entry, skill),
  );
  return rows.sort(byNewest).slice(0, options.limit);
}

function options(args) {
  return {
    days: numberArg(args, "days", 30),
    limit: numberArg(args, "limit", 8),
  };
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args?.skill) {
    process.stderr.write(`${USAGE}\n`);
    return 3;
  }
  const skill = normalizeSkill(args.skill);
  const chosen = options(args);
  const rows = collect(projectsRoot(args), skill, chosen);
  if (rows.length === 0) {
    process.stdout.write(`no run of ${skill} in ${chosen.days} days\n`);
    return 4;
  }
  const index = renderRunIndex(rows);
  process.stdout.write(`runs of ${skill}, newest first\n\n${index}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
