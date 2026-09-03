#!/usr/bin/env node
// Dates one claim, or compares two, and decides whether a deletion is safe.
// This is the gate for /doc-reconcile: the skill deletes the older side of a
// contradicting pair only when this CLI exits 0. All dating logic lives in
// lib/line-history.mjs. This file only parses arguments, compares results,
// and prints them.

import { fileURLToPath } from "node:url";
import { effectiveDate } from "./lib/line-history.mjs";

const DEFAULT_MIN_GAP_DAYS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const USAGE = [
  "Usage:",
  "  node claim-age.mjs --file=<path> --lines=<start>-<end> [--json]",
  "  node claim-age.mjs --pair=<file>:<start>-<end> --pair=<file>:<start>-<end>",
  "                      [--min-gap=<days>] [--json]",
  "",
  "Exit codes: 0 single mode / pair DECISIVE, 1 pair AMBIGUOUS, 3 usage error.",
].join("\n");

const KNOWN_FLAGS = new Set(["file", "lines", "pair", "min-gap", "json"]);
const LINES_RE = /^(\d+)-(\d+)$/;
const PAIR_RE = /^(.+):(\d+)-(\d+)$/;

function parseFlag(item) {
  const match = /^--([\w-]+)(?:=(.*))?$/.exec(item);
  if (!match || !KNOWN_FLAGS.has(match[1])) {
    throw new Error(`unknown option: ${item}`);
  }
  const [, key, value] = match;
  return { key, value: value ?? true };
}

function parseArgs(argv) {
  const args = { json: false, pair: [] };
  for (const item of argv) {
    const { key, value } = parseFlag(item);
    if (key === "pair") {
      args.pair.push(value);
    } else {
      args[key] = value;
    }
  }
  return args;
}

function parseNumber(raw, flag) {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`--${flag} must be a number, got ${raw}`);
  }
  return value;
}

function parseLines(raw) {
  if (typeof raw !== "string") {
    throw new Error("--lines is required, format <start>-<end>");
  }
  const match = LINES_RE.exec(raw);
  if (!match) {
    throw new Error(`malformed --lines: ${raw}`);
  }
  return { startLine: Number(match[1]), endLine: Number(match[2]) };
}

function parsePairArg(raw) {
  if (typeof raw !== "string") {
    throw new Error("malformed --pair: expected <file>:<start>-<end>");
  }
  const match = PAIR_RE.exec(raw);
  if (!match) {
    throw new Error(`malformed --pair: ${raw}`);
  }
  return { file: match[1], startLine: Number(match[2]), endLine: Number(match[3]) };
}

function parseSingleTarget(args) {
  if (typeof args.file !== "string") {
    throw new Error("--file is required");
  }
  const { startLine, endLine } = parseLines(args.lines);
  return { file: args.file, startLine, endLine };
}

function parsePairTargets(args) {
  if (args.pair.length !== 2) {
    throw new Error(`--pair must be given exactly twice, got ${args.pair.length}`);
  }
  return args.pair.map(parsePairArg);
}

function describeTarget(target) {
  return `${target.file}:${target.startLine}-${target.endLine}`;
}

function dateTarget(target, deps) {
  const result = effectiveDate(target, deps);
  return { ...target, ...result };
}

function singleText(dated) {
  const lines = [
    `Claim: ${describeTarget(dated)}`,
    `Verdict: ${dated.verdict}`,
    `Effective date: ${dated.date ? dated.date.toISOString() : "(none)"}`,
    `Deciding commit: ${dated.sha ? `${dated.sha} ${dated.summary}` : "(none)"}`,
    "Skipped cosmetic commits:",
  ];
  if (dated.skipped.length === 0) {
    lines.push("  (none)");
  } else {
    for (const commit of dated.skipped) {
      lines.push(`  ${commit.sha} ${commit.summary}`);
    }
  }
  return lines.join("\n");
}

function singleJSON(dated) {
  return JSON.stringify(
    {
      file: dated.file,
      startLine: dated.startLine,
      endLine: dated.endLine,
      verdict: dated.verdict,
      date: dated.date ? dated.date.toISOString() : null,
      sha: dated.sha,
      summary: dated.summary,
      skipped: dated.skipped,
    },
    null,
    2,
  );
}

function badSides(a, b) {
  const bad = [];
  if (a.verdict !== "dated") {
    bad.push(a);
  }
  if (b.verdict !== "dated") {
    bad.push(b);
  }
  return bad;
}

function ambiguousForBadSides(bad) {
  const reason = bad.map((target) => `${describeTarget(target)} has verdict ${target.verdict}`).join("; ");
  return { verdict: "AMBIGUOUS", reason, olderSide: null, gapDays: null };
}

function compareDatedPair(a, b, minGapDays) {
  const gapDays = Math.abs(a.date.getTime() - b.date.getTime()) / MS_PER_DAY;
  if (gapDays <= minGapDays) {
    return {
      verdict: "AMBIGUOUS",
      reason: `dates are only ${gapDays.toFixed(2)} days apart, within --min-gap=${minGapDays}`,
      olderSide: null,
      gapDays,
    };
  }
  const olderSide = a.date.getTime() < b.date.getTime() ? "a" : "b";
  const older = olderSide === "a" ? a : b;
  return {
    verdict: "DECISIVE",
    reason: `${describeTarget(older)} is older by ${gapDays.toFixed(2)} days`,
    olderSide,
    gapDays,
  };
}

function comparePair(a, b, minGapDays) {
  const bad = badSides(a, b);
  if (bad.length > 0) {
    return ambiguousForBadSides(bad);
  }
  return compareDatedPair(a, b, minGapDays);
}

function pairText(a, b, cmp) {
  const lines = [
    `Side A: ${describeTarget(a)}`,
    `  verdict: ${a.verdict}  date: ${a.date ? a.date.toISOString() : "(none)"}`,
    `Side B: ${describeTarget(b)}`,
    `  verdict: ${b.verdict}  date: ${b.date ? b.date.toISOString() : "(none)"}`,
    `Older: ${cmp.olderSide ? describeTarget(cmp.olderSide === "a" ? a : b) : "(undetermined)"}`,
    `Verdict: ${cmp.verdict} - ${cmp.reason}`,
  ];
  return lines.join("\n");
}

function pairSideJSON(side) {
  return {
    file: side.file,
    startLine: side.startLine,
    endLine: side.endLine,
    verdict: side.verdict,
    date: side.date ? side.date.toISOString() : null,
    sha: side.sha,
    summary: side.summary,
    skipped: side.skipped,
  };
}

function pairJSON(a, b, cmp) {
  return JSON.stringify(
    {
      a: pairSideJSON(a),
      b: pairSideJSON(b),
      olderSide: cmp.olderSide,
      gapDays: cmp.gapDays,
      verdict: cmp.verdict,
      reason: cmp.reason,
    },
    null,
    2,
  );
}

function runSingleMode(args, deps) {
  const target = parseSingleTarget(args);
  const dated = dateTarget(target, deps);
  process.stdout.write(`${args.json ? singleJSON(dated) : singleText(dated)}\n`);
  return 0;
}

function runPairMode(args, deps) {
  const targets = parsePairTargets(args);
  const minGapDays = parseNumber(args["min-gap"], "min-gap") ?? DEFAULT_MIN_GAP_DAYS;
  const a = dateTarget(targets[0], deps);
  const b = dateTarget(targets[1], deps);
  const cmp = comparePair(a, b, minGapDays);
  process.stdout.write(`${args.json ? pairJSON(a, b, cmp) : pairText(a, b, cmp)}\n`);
  return cmp.verdict === "DECISIVE" ? 0 : 1;
}

// `deps` is `{ run, history }`, passed straight through to effectiveDate() so
// tests can stub git without touching this repository.
export function run(argv, deps = {}) {
  try {
    const args = parseArgs(argv);
    if (args.pair.length > 0) {
      return runPairMode(args, deps);
    }
    return runSingleMode(args, deps);
  } catch (err) {
    process.stderr.write(`${err.message}\n${USAGE}\n`);
    return 3;
  }
}

const _filename = fileURLToPath(import.meta.url);

if (process.argv[1] === _filename) {
  process.exit(run(process.argv.slice(2)));
}
