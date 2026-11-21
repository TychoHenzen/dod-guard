#!/usr/bin/env node
// The deterministic steps of the doc-reconcile workflow. AI sessions judge
// pairs and make the edits; this script decides everything that needs no
// judgement and checks what the sessions did.
//
//   prep    --dir=<artifacts> --candidates=<file>     queue the pairs; print the count
//   advance --dir=<artifacts>                         record the judge's reply and queue the
//                                                     next pair; exit 0 once none is left, 1 otherwise
//   plan    --dir=<artifacts> --repo=<root> --claim-age=<script> [--generated=<globs>] [--min-gap=<days>]
//                                                     date CONFLICT and DUPLICATE pairs; print the action count
//   verify  --dir=<artifacts> --repo=<root>           keep only edits inside the planned ranges;
//                                                     print the changed file count
//   report  --dir=<artifacts>                         write and print report.md
//
// Exit 2 on any error.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

// The skill's cap: at most 20 judge dispatches per run, re-dispatches included.
export const BUDGET = 20;
export const VERDICTS = ["CONFLICT", "DUPLICATE", "STALE-SUBSET", "UNRELATED"];
const DATED = new Set(["CONFLICT", "DUPLICATE"]);
const WHITESPACE = /\s+/g;
const CR = /\r/g;
const HUNK = /^@@ -(\d+)(?:,(\d+))? \+/;
const DESCRIPTION = /"description"\s*:\s*("(?:[^"\\]|\\.)*")/;
const GLOB_SPECIAL = /[.+^${}()|[\]\\]/g;
const OPTION = /^--([\w-]+)=(.*)$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function claimOf(side) {
  return { file: side.file, startLine: side.startLine, endLine: side.endLine, heading: side.heading, text: side.text };
}

function where(claim) {
  return `${claim.file}:${claim.startLine}-${claim.endLine}`;
}

// ---------------------------------------------------------------- judging

function squash(text) {
  return String(text ?? "")
    .replace(WHITESPACE, " ")
    .trim();
}

function quotedIn(span, text) {
  const wanted = squash(span);
  return wanted !== "" && squash(text).includes(wanted);
}

// A CONFLICT must quote words from each claim; the judge may name them in either order.
function conflictEvidenceProblem(reply, pair) {
  const { evidenceA, evidenceB } = reply;
  const straight = quotedIn(evidenceA, pair.a.text) && quotedIn(evidenceB, pair.b.text);
  const crossed = quotedIn(evidenceA, pair.b.text) && quotedIn(evidenceB, pair.a.text);
  return straight || crossed ? null : "the CONFLICT evidence does not quote words from each claim";
}

// Returns null for a usable reply, otherwise what is wrong with it.
export function replyProblem(reply, pair) {
  if (reply === null || typeof reply !== "object") {
    return "the judge wrote no reply";
  }
  if (!VERDICTS.includes(reply.verdict)) {
    return `unknown verdict ${JSON.stringify(reply.verdict)}`;
  }
  if (squash(reply.why) === "") {
    return "the reply gives no reason";
  }
  return reply.verdict === "CONFLICT" ? conflictEvidenceProblem(reply, pair) : null;
}

function statePath(dir) {
  return join(dir, "state.json");
}

function settled(state, id) {
  return id in state.verdicts || id in state.undecided;
}

// The next pair is the first one without a verdict. A malformed reply leaves
// its pair first in line, which is the skill's one re-dispatch.
function queueNext(dir, state) {
  const open = state.pairs.filter((pair) => !settled(state, pair.id));
  if (state.dispatches >= BUDGET) {
    for (const pair of open) {
      state.undecided[pair.id] = { reason: "out of budget", detail: `the run judged ${BUDGET} times` };
    }
  }
  const next = state.dispatches >= BUDGET ? undefined : open[0];
  state.current = next ? next.id : null;
  const currentPath = join(dir, "current.json");
  rmSync(currentPath, { force: true });
  if (next) {
    writeJson(currentPath, { id: next.id, a: claimOf(next.a), b: claimOf(next.b) });
  }
  writeJson(statePath(dir), state);
}

export function prep({ dir, candidates }) {
  const scan = readJson(candidates);
  const pairs = scan.pairs.map((pair, index) => ({ id: `p${index + 1}`, score: pair.score, a: pair.a, b: pair.b }));
  const state = { scan: scan.options, pairs, dispatches: 0, attempts: {}, verdicts: {}, undecided: {}, current: null };
  rmSync(join(dir, "verdict.json"), { force: true });
  queueNext(dir, state);
  return pairs.length;
}

function readReply(path) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

function recordReply(state, pair, reply) {
  const problem = replyProblem(reply, pair);
  if (problem === null) {
    state.verdicts[pair.id] = {
      verdict: reply.verdict,
      evidenceA: squash(reply.evidenceA),
      evidenceB: squash(reply.evidenceB),
      why: squash(reply.why),
    };
    return;
  }
  state.attempts[pair.id] = (state.attempts[pair.id] ?? 0) + 1;
  if (state.attempts[pair.id] >= 2) {
    state.undecided[pair.id] = { reason: "malformed verdict", detail: problem };
  }
}

// Returns true once every pair is settled.
export function advance({ dir }) {
  const state = readJson(statePath(dir));
  const pair = state.pairs.find((candidate) => candidate.id === state.current);
  const replyPath = join(dir, "verdict.json");
  if (pair) {
    state.dispatches += 1;
    recordReply(state, pair, readReply(replyPath));
  }
  rmSync(replyPath, { force: true });
  queueNext(dir, state);
  return state.current === null;
}

// ---------------------------------------------------------------- planning

export function globToRegExp(glob) {
  const source = glob
    .split("**")
    .map((part) => part.replace(GLOB_SPECIAL, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"))
    .join(".*");
  return new RegExp(`^${source}$`);
}

function matcher(globs) {
  const patterns = String(globs ?? "")
    .split(",")
    .map((glob) => glob.trim())
    .filter(Boolean)
    .map(globToRegExp);
  return (file) => patterns.some((pattern) => pattern.test(file));
}

// What is on disk now where the scanner saw the claim. For a manifest the
// claim is the description string on its line.
export function textAt(repo, claim) {
  const path = join(repo, claim.file);
  if (!existsSync(path)) {
    return null;
  }
  const lines = readFileSync(path, "utf8").replace(CR, "").split("\n");
  if (claim.file.endsWith(".json")) {
    const match = DESCRIPTION.exec(lines[claim.startLine - 1] ?? "");
    return match ? JSON.parse(match[1]) : null;
  }
  return lines.slice(claim.startLine - 1, claim.endLine).join("\n");
}

function dateSides(options, a, b) {
  const args = [options.claimAge, `--pair=${where(a)}`, `--pair=${where(b)}`, `--min-gap=${options.minGap}`, "--json"];
  const result = spawnSync(process.execPath, args, { cwd: options.repo, encoding: "utf8" });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`claim-age failed on ${where(a)} and ${where(b)}: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function sideDates(dating) {
  return { a: dating.a.date, b: dating.b.date };
}

function undecidedEntry(pair, reason, detail, dates = null) {
  return { id: pair.id, reason, detail, a: claimOf(pair.a), b: claimOf(pair.b), dates };
}

function action(pair, verdict, dating) {
  const olderIsA = dating.olderSide === "a";
  const older = olderIsA ? pair.a : pair.b;
  const newer = olderIsA ? pair.b : pair.a;
  return {
    id: pair.id,
    verdict: verdict.verdict,
    kind: verdict.verdict === "CONFLICT" ? "delete" : "point",
    target: claimOf(older),
    survivor: claimOf(newer),
    evidence: [verdict.evidenceA, verdict.evidenceB].filter(Boolean),
    why: verdict.why,
    settledBy: olderIsA ? dating.a : dating.b,
    reason: dating.reason,
  };
}

function decide(options, pair, verdict) {
  if (options.isGenerated(pair.a.file) || options.isGenerated(pair.b.file)) {
    return undecidedEntry(pair, "generated source", "a declared generator reads one of the files");
  }
  for (const side of [pair.a, pair.b]) {
    if (textAt(options.repo, side) !== side.text) {
      return undecidedEntry(pair, "range changed", `${where(side)} no longer holds the scanned text`);
    }
  }
  const dating = dateSides(options, pair.a, pair.b);
  if (dating.verdict !== "DECISIVE") {
    return undecidedEntry(pair, "ambiguous dating", dating.reason, sideDates(dating));
  }
  return action(pair, verdict, dating);
}

function overlaps(left, right) {
  return left.file === right.file && left.startLine <= right.endLine && right.startLine <= left.endLine;
}

// One claim can sit in several pairs. Only the first action on a range may
// edit it, and no action may point at a claim another action removes.
function dropCollisions(actions, pairsById) {
  const kept = [];
  const dropped = [];
  for (const candidate of actions) {
    const clash =
      kept.some((other) => overlaps(other.target, candidate.target)) ||
      actions.some((other) => other !== candidate && overlaps(other.target, candidate.survivor));
    if (clash) {
      dropped.push(undecidedEntry(pairsById.get(candidate.id), "range changed", "another action edits the same claim"));
    } else {
      kept.push(candidate);
    }
  }
  return { kept, dropped };
}

export function plan(options) {
  const state = readJson(statePath(options.dir));
  const pairsById = new Map(state.pairs.map((pair) => [pair.id, pair]));
  const isGenerated = matcher(options.generated);
  const settings = { ...options, isGenerated, minGap: options.minGap ?? 1 };
  const undecided = Object.entries(state.undecided).map(([id, entry]) =>
    undecidedEntry(pairsById.get(id), entry.reason, entry.detail),
  );
  const actions = [];
  for (const pair of state.pairs) {
    const verdict = state.verdicts[pair.id];
    if (!verdict || !DATED.has(verdict.verdict)) {
      continue;
    }
    const outcome = decide(settings, pair, verdict);
    (outcome.kind ? actions : undecided).push(outcome);
  }
  const { kept, dropped } = dropCollisions(actions, pairsById);
  const judged = Object.keys(state.verdicts).length;
  writeJson(join(options.dir, "plan.json"), {
    scan: state.scan,
    pairCount: state.pairs.length,
    judged,
    verdicts: state.verdicts,
    actions: kept,
    undecided: [...undecided, ...dropped],
  });
  return kept.length;
}

// ---------------------------------------------------------------- verifying

function git(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function lines(text) {
  return text.split("\n").filter(Boolean);
}

export function changedFiles(repo) {
  return {
    tracked: lines(git(repo, ["diff", "--name-only"])),
    untracked: lines(git(repo, ["ls-files", "--others", "--exclude-standard"])),
  };
}

// The original-side line ranges a unified diff with no context touches. A
// pure insertion (count 0) touches the gap after its start line.
export function hunks(diff) {
  const ranges = [];
  for (const line of diff.split("\n")) {
    const match = HUNK.exec(line);
    if (match) {
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      ranges.push(count === 0 ? { start: start + 0.5, end: start + 0.5 } : { start, end: start + count - 1 });
    }
  }
  return ranges;
}

function inside(range, target) {
  return range.start >= target.startLine - 0.5 && range.end <= target.endLine + 0.5;
}

export function rangesFit(ranges, targets) {
  return ranges.every((range) => targets.some((target) => inside(range, target)));
}

function revert(repo, file) {
  git(repo, ["checkout", "--", file]);
}

function validateManifests(repo, files) {
  const validator = join(repo, "scripts", "ci", "validate-plugins.mjs");
  if (existsSync(validator)) {
    const result = spawnSync(process.execPath, [validator], { cwd: repo, encoding: "utf8" });
    return result.status === 0 ? [] : files;
  }
  return files.filter((file) => {
    try {
      JSON.parse(readFileSync(join(repo, file), "utf8"));
      return false;
    } catch {
      return true;
    }
  });
}

function stray(repo, planned, reverted) {
  const { tracked, untracked } = changedFiles(repo);
  for (const file of tracked.filter((name) => !planned.has(name))) {
    revert(repo, file);
    reverted.push({ file, reason: "the plan names no claim in it" });
  }
  for (const file of untracked) {
    rmSync(join(repo, file), { force: true });
    reverted.push({ file, reason: "a new file the plan did not ask for" });
  }
}

function fileDiff(repo, file) {
  return hunks(git(repo, ["diff", "-U0", "--", file]));
}

function dropFile(repo, file, reason, log) {
  revert(repo, file);
  log.reverted.push({ file, reason });
  log.failed.set(file, reason);
}

export function verify({ dir, repo }) {
  const planPath = join(dir, "plan.json");
  const current = readJson(planPath);
  const planned = new Set(current.actions.map((entry) => entry.target.file));
  const log = { reverted: [], failed: new Map() };
  const { reverted, failed } = log;
  stray(repo, planned, reverted);
  for (const file of changedFiles(repo).tracked) {
    const targets = current.actions.filter((entry) => entry.target.file === file).map((entry) => entry.target);
    if (!rangesFit(fileDiff(repo, file), targets)) {
      dropFile(repo, file, "edit outside the named range", log);
    }
  }
  const manifests = changedFiles(repo).tracked.filter((file) => file.endsWith(".json"));
  for (const file of validateManifests(repo, manifests)) {
    dropFile(repo, file, "manifest validation failed", log);
  }
  const touched = new Map(changedFiles(repo).tracked.map((file) => [file, fileDiff(repo, file)]));
  const applied = [];
  for (const entry of current.actions) {
    const ranges = touched.get(entry.target.file) ?? [];
    if (ranges.some((range) => inside(range, entry.target))) {
      applied.push(entry);
      continue;
    }
    const reason = failed.get(entry.target.file) ?? "not applied";
    current.undecided.push({ id: entry.id, reason, detail: "", a: entry.target, b: entry.survivor, dates: null });
  }
  writeJson(planPath, { ...current, applied, reverted });
  return touched.size;
}

// ---------------------------------------------------------------- reporting

function changeLines(entry, index) {
  const verb = entry.kind === "delete" ? "Deleted" : "Pointed";
  const object =
    entry.kind === "delete" ? `, which contradicts \`${where(entry.survivor)}\`` : ` at \`${where(entry.survivor)}\``;
  const out = [`${index + 1}. ${verb} \`${where(entry.target)}\`${object} (${entry.verdict}).`];
  if (entry.evidence.length > 0) {
    out.push(`   - Evidence: ${entry.evidence.map((quote) => `"${quote}"`).join(" / ")}`);
  }
  const by = entry.settledBy;
  out.push(`   - Age settled by ${by.sha?.slice(0, 10) ?? "unknown"} "${by.summary ?? ""}" (${by.date ?? "no date"}).`);
  if (by.skipped?.length > 0) {
    out.push(
      `   - Wording-only commits skipped: ${by.skipped.map((skip) => `${skip.sha.slice(0, 10)} "${skip.summary}"`).join(", ")}`,
    );
  }
  return out;
}

function undecidedLines(entry, index) {
  const dates = entry.dates ? ` Dates: ${entry.dates.a ?? "none"} / ${entry.dates.b ?? "none"}.` : "";
  const detail = entry.detail ? ` (${entry.detail})` : "";
  return [`${index + 1}. \`${where(entry.a)}\` vs \`${where(entry.b)}\`: ${entry.reason}${detail}.${dates}`];
}

export function report({ dir }) {
  const current = readJson(join(dir, "plan.json"));
  const applied = current.applied ?? [];
  const scan = current.scan ?? {};
  const out = [
    "## Doc reconcile",
    "",
    `Scan threshold ${scan.threshold ?? "?"}, limit ${scan.limit ?? "none"}. ${current.pairCount} pairs, ${current.judged} judged, ${applied.length} changed.`,
    "",
    "### Changes",
    "",
    ...(applied.length > 0 ? applied.flatMap(changeLines) : ["None."]),
    "",
    "### Undecided",
    "",
    ...(current.undecided.length > 0 ? current.undecided.flatMap(undecidedLines) : ["None."]),
  ];
  for (const entry of current.reverted ?? []) {
    out.push("", `Reverted \`${entry.file}\`: ${entry.reason}.`);
  }
  const text = `${out.join("\n")}\n`;
  writeFileSync(join(dir, "report.md"), text);
  return text;
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (const arg of rest) {
    const match = OPTION.exec(arg);
    if (!match) {
      throw new Error(`unknown argument: ${arg}`);
    }
    const key = match[1].replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
    options[key] = match[2];
  }
  if (!options.dir) {
    throw new Error("missing --dir");
  }
  return options;
}

const COMMANDS = {
  prep: (options) => ({ out: String(prep(options)), code: 0 }),
  advance: (options) => ({ out: "", code: advance(options) ? 0 : 1 }),
  plan: (options) => ({
    out: String(plan({ ...options, minGap: options.minGap ? Number(options.minGap) : 1 })),
    code: 0,
  }),
  verify: (options) => ({ out: String(verify(options)), code: 0 }),
  report: (options) => ({ out: report(options).trimEnd(), code: 0 }),
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const run = COMMANDS[options.command];
    if (!run) {
      throw new Error(`unknown command: ${options.command}`);
    }
    const { out, code } = run(options);
    if (out !== "") {
      process.stdout.write(`${out}\n`);
    }
    process.exit(code);
  } catch (error) {
    process.stderr.write(`reconcile: ${error.message}\n`);
    process.exit(2);
  }
}
