#!/usr/bin/env node
// The deterministic steps of the skill-migrate workflow. Sessions write the
// inventory, contract, classification, replacement body and audit; this
// script turns them into the approval form and the files skill-migrate's own
// gates read, runs those gates, and writes the report. Nothing here writes
// the target.
//
//   verbatim --dir                                   contract.md's Verbatim section to verbatim.txt
//   options  --dir                                   validate cuts.json; print the form
//   approve  --dir --answer=<json>                   write approvals.json and corrections.md
//   leak     --dir --repo --target --commit --pack   scan the writer's inputs against the original;
//            [--strict=true]                         PASS or the leaking files; strict exits 1 on a leak
//   gate     --dir --repo --target --commit --pack   merge, then overlap and regression; PASS or why not
//   final    --dir --repo --target --commit --pack   the gate plus finish-check; exit 1 when a gate fails
//   report   --dir --repo --target                   write and print report.md
//
// Exit 2 on any error.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { scoreOverlap } from "../../skills/blind-rewrite/scripts/overlap-metrics.mjs";

const OPTION = /^--([\w-]+)=(.*)$/s;
const ID = /^[a-z0-9][a-z0-9-]*$/;
export const NONE = "none";
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const MAX_BUFFER = 256 * 1024 * 1024;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

// ---------------------------------------------------------------- contract

// One item per line, leading "- " removed, as the skill's phase 1 says.
export function verbatim({ dir }) {
  const lines = read(join(dir, "contract.md")).split(/\r?\n/);
  const start = lines.findIndex((line) => /^###\s+Verbatim\b/.test(line));
  if (start < 0) {
    throw new Error("contract.md has no ### Verbatim section");
  }
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3}\s/.test(line)) {
      break;
    }
    if (line.startsWith("- ")) {
      items.push(line.slice(2));
    }
  }
  writeFileSync(join(dir, "verbatim.txt"), items.length > 0 ? `${items.join("\n")}\n` : "");
  return String(items.length);
}

// ---------------------------------------------------------------- the form

function cutProblem(cut, seen) {
  if (!ID.test(String(cut.id)) || cut.id === NONE || seen.has(cut.id)) {
    return `bad or repeated id ${JSON.stringify(cut.id)}`;
  }
  if (cut.kind !== "text" && cut.kind !== "claim") {
    return 'kind is neither "text" nor "claim"';
  }
  for (const field of ["value", "keep", "cut"]) {
    if (typeof cut[field] !== "string" || cut[field].trim() === "") {
      return `names no ${field}`;
    }
  }
  return null;
}

export function options({ dir }) {
  const raw = readJson(join(dir, "cuts.json"));
  const seen = new Set();
  const cuts = [];
  const rejected = [];
  for (const cut of Array.isArray(raw.cuts) ? raw.cuts : []) {
    const problem = cutProblem(cut, seen);
    seen.add(cut.id);
    const entry = {
      id: String(cut.id),
      kind: cut.kind,
      value: String(cut.value ?? ""),
      keep: String(cut.keep ?? ""),
      cut: String(cut.cut ?? ""),
    };
    if (problem) {
      rejected.push({ ...entry, problem });
    } else {
      cuts.push(entry);
    }
  }
  writeJson(join(dir, "items.json"), { cuts, rejected });
  const choices = cuts.map((cut) => ({
    id: cut.id,
    label: `Cut: ${cut.value.length > 80 ? `${cut.value.slice(0, 77)}...` : cut.value}`,
    does: cut.cut,
  }));
  choices.push({ id: NONE, label: "Cut nothing", does: "keep every SCAFFOLDING item" });
  const intro = [
    "Pick the SCAFFOLDING to cut; everything not picked is kept.",
    `REQUIRED and OBSERVED claims are in ${join(dir, "contract.md")}; every tagged item is in ${join(dir, "classification.md")}.`,
    "Use the answer text for anything else: a missed requirement, a REQUIRED claim that is wrong, or an edit to exact text. The text is also recorded as the reason for each cut.",
  ].join("\n");
  const blocks = cuts.map((cut) => `${cut.id} (${cut.kind}): ${cut.value}\n  kept: ${cut.keep}\n  cut: ${cut.cut}`);
  const notes = rejected.map((entry) => `${entry.id}: not offered, ${entry.problem}; it is kept`);
  return { options: choices, count: String(cuts.length), message: [intro, ...blocks, ...notes].join("\n\n") };
}

// Every cut carries the maintainer's words as its reason, as phase 3 asks.
export function approve({ dir, answer }) {
  const { cuts } = readJson(join(dir, "items.json"));
  const parsed = JSON.parse(answer) ?? {};
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  const picked = decisions.includes(NONE) ? new Set() : new Set(decisions);
  const reason = text === "" ? "picked on the skill-migrate form" : text;
  const approvedCuts = cuts
    .filter((cut) => picked.has(cut.id))
    .map((cut) => (cut.kind === "text" ? { text: cut.value, reason } : { claim: cut.value, reason }));
  writeJson(join(dir, "approvals.json"), { approvedCuts });
  writeFileSync(join(dir, "corrections.md"), text === "" ? "The maintainer gave no corrections.\n" : `${text}\n`);
  return { count: String(approvedCuts.length) };
}

// ---------------------------------------------------------------- gates

function original(repo, commit, target) {
  return execFileSync("git", ["cat-file", "blob", `${commit}:${target}`], { cwd: repo, maxBuffer: MAX_BUFFER });
}

// The original's frontmatter, then the writer's body without any frontmatter
// of its own.
export function merge({ dir, repo, target, commit }) {
  const source = original(repo, commit, target).toString("utf8");
  const match = FRONTMATTER.exec(source);
  const head = match ? match[0] : "";
  const body = read(join(dir, "body.md"))
    .replace(FRONTMATTER, "")
    .replace(/^\s*\n/, "");
  if (body.trim() === "") {
    throw new Error("the writer left body.md empty");
  }
  const separator = head === "" ? "" : "\n";
  writeFileSync(join(dir, "migrated.md"), `${head}${separator}${body}`);
}

function runNode(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER });
}

function bodyOf(text) {
  return text.replace(FRONTMATTER, "");
}

// Brings the original out of git for one check and removes it again. The
// check gets the whole file and both bodies: the merge copies the
// frontmatter back on purpose, so the overlap scan compares bodies alone,
// or any description longer than its run limit would fail every round.
function withOriginal(options, check) {
  const folder = join(options.dir, "original-gate");
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const source = original(options.repo, options.commit, options.target).toString("utf8");
  const paths = {
    whole: join(folder, "original.md"),
    body: join(folder, "original-body.md"),
    rewriteBody: join(folder, "migrated-body.md"),
  };
  writeFileSync(paths.whole, source);
  writeFileSync(paths.body, bodyOf(source));
  writeFileSync(paths.rewriteBody, bodyOf(read(join(options.dir, "migrated.md"))));
  try {
    return check(paths);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function overlap(options, paths) {
  const result = runNode(join(options.pack, "skills", "blind-rewrite", "scripts", "overlap-scan.mjs"), [
    "--mode=prose",
    `--original=${paths.body}`,
    `--rewrite=${paths.rewriteBody}`,
    `--contract-file=${join(options.dir, "verbatim.txt")}`,
    "--require-contract",
  ]);
  writeFileSync(join(options.dir, "overlap.json"), result.stdout);
  if (result.status === 1) {
    return { verdict: "too close", feedback: "too close" };
  }
  if (result.status !== 0) {
    throw new Error(`overlap-scan.mjs exited ${result.status}: ${result.stderr}`);
  }
  return null;
}

// The files the blind writer reads come from sessions that read the
// original. A writer that copies their phrasing copies the original second
// hand, so each one is scored against the original before any writer runs,
// with the Verbatim items exempt.
export const WRITER_INPUTS = ["inventory.md", "contract.md", "classification.md"];
// ASSUMPTION: the prose run and n-gram limits of blind-rewrite's
// overlap-metrics.mjs, which does not export them. Only these two measure
// copied wording; its order and sentence scores compare a rewrite with the
// text it replaces, and a short note scores high on order against anything.
const LEAK_LIMITS = { run: 15, ngram: 0.2 };

function leakScore(paths, dir, file) {
  const exempt = read(join(dir, "verbatim.txt"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const score = scoreOverlap(read(paths.body), read(join(dir, file)), { mode: "prose", contract: exempt });
  return score.run > LEAK_LIMITS.run || score.ngram > LEAK_LIMITS.ngram ? score : null;
}

// Prints PASS, or the leaking files joined by commas after writing
// leak.md, which says why for each. With strict, a leak is a GateFailure.
export function leak(options) {
  const { dir } = options;
  for (const file of [...WRITER_INPUTS, "verbatim.txt"]) {
    if (!existsSync(join(dir, file))) {
      throw new Error(`${file} was not written`);
    }
  }
  const leaks = withOriginal(options, (paths) =>
    WRITER_INPUTS.map((file) => ({ file, score: leakScore(paths, dir, file) })).filter(({ score }) => score),
  );
  const feedback = join(dir, "leak.md");
  if (leaks.length === 0) {
    rmSync(feedback, { force: true });
    return "PASS";
  }
  const lines = leaks.map(
    ({ file, score }) =>
      `- ${file}: its longest run of words shared with the original is ${score.run}, and ${Math.round(score.ngram * 100)}% of its word sequences match.`,
  );
  writeFileSync(feedback, `${lines.join("\n")}\n`);
  if (options.strict === "true") {
    throw new GateFailure(`still too close to the original after rewording:\n${lines.join("\n")}`);
  }
  return leaks.map(({ file }) => file).join(",");
}

function regression(options) {
  const { kind } = readJson(join(options.dir, "baseline.json"));
  const result = runNode(join(options.pack, "skills", "skill-migrate", "scripts", "migration-check.mjs"), [
    join(options.dir, "migrated.md"),
    `--before=${join(options.dir, "baseline.json")}`,
    `--kind=${kind}`,
  ]);
  writeFileSync(join(options.dir, "comparison.txt"), result.stdout);
  if (result.status === 1) {
    return {
      verdict: "regression",
      feedback: `migration-check reports a check that passed before now fails:\n${result.stdout}`,
    };
  }
  if (result.status !== 0) {
    throw new Error(`migration-check.mjs exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  return null;
}

function finishCheck(options, paths) {
  const result = runNode(join(options.pack, "skills", "skill-migrate", "scripts", "finish-check.mjs"), [
    `--original=${paths.whole}`,
    `--rewrite=${join(options.dir, "migrated.md")}`,
    `--contract=${join(options.dir, "contract.md")}`,
    `--verbatim=${join(options.dir, "verbatim.txt")}`,
    `--approvals=${join(options.dir, "approvals.json")}`,
    `--audit=${join(options.dir, "audit.md")}`,
  ]);
  writeFileSync(join(options.dir, "finish.json"), result.stdout);
  if (result.status === 0) {
    return null;
  }
  if (result.status === 1) {
    return { verdict: "unfinished", feedback: `finish-check reports missing or dropped items:\n${result.stdout}` };
  }
  throw new Error(`finish-check.mjs exited ${result.status}: ${result.stderr}`);
}

// A failed round throws its body away; the next writer starts from the
// contract and the one line of feedback alone.
export function gate(options) {
  merge(options);
  const failure = withOriginal(options, (paths) => overlap(options, paths)) ?? regression(options);
  const feedback = join(options.dir, "feedback.md");
  if (!failure) {
    rmSync(feedback, { force: true });
    return "PASS";
  }
  writeFileSync(feedback, `${failure.feedback}\n`);
  rmSync(join(options.dir, "body.md"), { force: true });
  rmSync(join(options.dir, "migrated.md"), { force: true });
  return failure.verdict;
}

export class GateFailure extends Error {}

export function final(options) {
  merge(options);
  const failure =
    withOriginal(options, (paths) => overlap(options, paths) ?? finishCheck(options, paths)) ?? regression(options);
  if (failure) {
    throw new GateFailure(failure.feedback);
  }
  return "PASS";
}

// ---------------------------------------------------------------- report

function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) {
    return "";
  }
  const end = lines.findIndex((line, index) => index > start && /^#{1,3}\s/.test(line));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
}

export function report({ dir, repo, target }) {
  const { approvedCuts } = readJson(join(dir, "approvals.json"));
  const migrated = join(dir, "migrated.md");
  const diff = spawnSync("git", ["diff", "--no-index", "--", target, migrated], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  if (diff.status !== 0 && diff.status !== 1) {
    throw new Error(`git diff --no-index failed: ${diff.stderr}`);
  }
  const lines = (path) => readFileSync(path, "utf8").split(/\r?\n/).length;
  const out = [
    `## Skill migrate: ${target}`,
    "",
    `The migrated draft is ${migrated}. The target is unchanged; land the draft in the skill's source checkout if you accept it.`,
    "",
    `- Lines: ${lines(join(repo, target))} before, ${lines(migrated)} after`,
    "- Gates: writer inputs reworded where needed, overlap pass, regression pass, finish-check pass",
    "",
    "### Migration check",
    "",
    "```",
    read(join(dir, "comparison.txt")).trimEnd(),
    "```",
    "",
    "### Approved cuts",
    "",
  ];
  if (approvedCuts.length === 0) {
    out.push("- None.");
  }
  for (const cut of approvedCuts) {
    out.push(`- ${cut.text ?? cut.claim} (reason: ${cut.reason})`);
  }
  const audited = section(read(join(dir, "audit.md")), "### Approved cuts");
  if (audited !== "") {
    out.push("", "The gap audit listed these as approved cuts:", "", audited);
  }
  out.push("", "### Diff", "", "```diff", diff.stdout.trimEnd(), "```");
  const text = `${out.join("\n")}\n`;
  writeFileSync(join(dir, "report.md"), text);
  return text;
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const parsed = { command };
  for (const arg of rest) {
    const match = OPTION.exec(arg);
    if (!match) {
      throw new Error(`unknown argument: ${arg}`);
    }
    parsed[match[1]] = match[2];
  }
  if (!parsed.dir) {
    throw new Error("missing --dir");
  }
  return parsed;
}

const COMMANDS = {
  verbatim: (args) => verbatim(args),
  options: (args) => JSON.stringify(options(args)),
  approve: (args) => JSON.stringify(approve(args)),
  leak: (args) => leak(args),
  gate: (args) => gate(args),
  final: (args) => final(args),
  report: (args) => report(args).trimEnd(),
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const command = COMMANDS[args.command];
    if (!command) {
      throw new Error(`unknown command: ${args.command}`);
    }
    process.stdout.write(`${command(args)}\n`);
  } catch (error) {
    process.stderr.write(`skill-migrate: ${error.message}\n`);
    process.exit(error instanceof GateFailure ? 1 : 2);
  }
}
