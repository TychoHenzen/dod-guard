#!/usr/bin/env node
// The deterministic steps of the codex-migrate workflow. A proposal session
// writes slices.json; this script turns it into the approval form, verifies
// each slice a session applies, commits it or reverts it, and writes the
// report.
//
//   options --dir=<artifacts> --repo=<root>                          validate slices.json; print the form
//   approve --dir --repo --scanner=<script> --answer=<json>          record the answer, queue the first slice
//   advance --dir --repo --scanner=<script> --converter=<script>     verify the applied slice, commit or revert
//                                                                    it, queue the next; exit 0 once none is left
//   report  --dir=<artifacts>                                        write and print report.md
//
// Exit 2 on any error.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ID = /^[a-z0-9][a-z0-9-]*$/;
const OPTION = /^--([\w-]+)=(.*)$/s;
export const NONE = "none";
export const KINDS = new Set(["reword", "move", "reduce-claude", "agents"]);
// More slices than this in one run are reported as not run.
export const MAX_SLICES = 10;
const GENERATED = ".codex/agents/";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry !== "") : [];
}

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function git(repo, args) {
  const result = run("git", args, repo);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function relative(path) {
  return path !== "" && !path.startsWith("/") && !path.includes("..") && !path.includes("\\");
}

// ---------------------------------------------------------------- the form

function sliceProblem(slice, seen) {
  if (!ID.test(String(slice.id)) || slice.id === NONE || seen.has(slice.id)) {
    return `bad or repeated id ${JSON.stringify(slice.id)}`;
  }
  if (!KINDS.has(slice.kind)) {
    return `kind ${JSON.stringify(slice.kind)} is not one of ${[...KINDS].join(", ")}`;
  }
  const paths = [...list(slice.files), ...list(slice.from), ...list(slice.to)];
  if (!paths.every(relative)) {
    return "every path must be repository-relative with forward slashes";
  }
  if (paths.some((path) => path.startsWith(GENERATED))) {
    return "generated agent TOML is never edited by hand; use an agents slice";
  }
  if (
    (slice.kind === "move" || slice.kind === "reduce-claude") &&
    (list(slice.from).length === 0 || list(slice.to).length === 0)
  ) {
    return "a move names its source (from) and destination (to)";
  }
  return slice.kind !== "agents" && paths.length === 0 ? "names no file to change" : null;
}

function normalize(slice) {
  const files = new Set([...list(slice.files), ...list(slice.from), ...list(slice.to)]);
  return {
    id: slice.id,
    label: String(slice.label ?? slice.id),
    kind: slice.kind,
    files: [...files],
    from: list(slice.from),
    to: list(slice.to),
    signals: list(slice.signals),
    plan: String(slice.plan ?? ""),
  };
}

export function options({ dir }) {
  const raw = readJson(join(dir, "slices.json"));
  const seen = new Set();
  const slices = [];
  const rejected = [];
  for (const slice of Array.isArray(raw.slices) ? raw.slices : []) {
    const problem = sliceProblem(slice, seen);
    seen.add(slice.id);
    if (problem) {
      rejected.push({ id: String(slice.id), label: String(slice.label ?? ""), problem });
    } else {
      slices.push(normalize(slice));
    }
  }
  const agentSource = String(raw.agentSource ?? "");
  writeJson(join(dir, "items.json"), { slices, rejected, test: String(raw.test ?? "").trim(), agentSource });
  const choices = slices.map((slice) => ({
    id: slice.id,
    label: slice.label,
    does: `${slice.kind}: ${slice.files.join(", ") || "regenerate .codex/agents"}`,
  }));
  choices.push({ id: NONE, label: "Apply nothing", does: "end the run with no change" });
  const blocks = slices.map(
    (slice) =>
      `${slice.id}: ${slice.label} (${slice.kind})\n  files: ${slice.files.join(", ") || "-"}\n  plan: ${slice.plan}`,
  );
  const intro = `Pick the slices to apply; they run back to back in this order. The proposal is in ${join(dir, "proposal.md")}.`;
  return { options: choices, count: String(slices.length), message: [intro, ...blocks].join("\n\n") };
}

// ---------------------------------------------------------------- slices

export function scan(repo, scanner) {
  const result = run(process.execPath, [scanner, repo, "--json"], repo);
  if (result.status !== 0) {
    throw new Error(`the scanner exited ${result.status}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function statePath(dir) {
  return join(dir, "state.json");
}

function queueNext(dir, state, options) {
  const next = state.queue.find((id) => !(id in state.results));
  state.current = next ?? null;
  state.before = next ? scan(options.repo, options.scanner) : null;
  state.head = git(options.repo, ["rev-parse", "HEAD"]).trim();
  const currentPath = join(dir, "current.json");
  rmSync(currentPath, { force: true });
  if (next) {
    writeJson(
      currentPath,
      state.slices.find((slice) => slice.id === next),
    );
  }
  writeJson(statePath(dir), state);
}

export function approve(options) {
  const { slices, test, agentSource } = readJson(join(options.dir, "items.json"));
  const decisions = list(JSON.parse(options.answer)?.decisions);
  const picked = decisions.includes(NONE) ? new Set() : new Set(decisions);
  const chosen = slices.filter((slice) => picked.has(slice.id));
  const results = {};
  for (const slice of chosen.slice(MAX_SLICES)) {
    results[slice.id] = { status: "not run", reason: `a run applies at most ${MAX_SLICES} slices` };
  }
  const state = {
    slices,
    test,
    agentSource,
    queue: chosen.map((slice) => slice.id),
    results,
    current: null,
    before: null,
  };
  queueNext(options.dir, state, options);
  return { count: String(chosen.length) };
}

// Per file and signal, how many findings the scanner reported.
export function counts(report) {
  const table = new Map();
  for (const finding of report.findings ?? []) {
    const key = `${finding.file}\u001f${finding.signal}`;
    table.set(key, (table.get(key) ?? 0) + 1);
  }
  return table;
}

function total(table, files, signals = null) {
  let sum = 0;
  for (const [key, value] of table) {
    const [file, signal] = key.split("\u001f");
    if (files.includes(file) && (signals === null || signals.includes(signal))) {
      sum += value;
    }
  }
  return sum;
}

function bySignal(table, files) {
  const out = new Map();
  for (const [key, value] of table) {
    const [file, signal] = key.split("\u001f");
    if (files.includes(file)) {
      out.set(signal, (out.get(signal) ?? 0) + value);
    }
  }
  return out;
}

function delta(minuend, subtrahend) {
  const out = new Map();
  for (const signal of new Set([...minuend.keys(), ...subtrahend.keys()])) {
    const value = (minuend.get(signal) ?? 0) - (subtrahend.get(signal) ?? 0);
    if (value > 0) {
      out.set(signal, value);
    }
  }
  return out;
}

function same(left, right) {
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
}

function format(table) {
  return [...table].map(([signal, value]) => `${signal} x${value}`).join(", ") || "none";
}

function untouchedElsewhere(before, after, files) {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].every((key) => {
    const file = key.split("\u001f")[0];
    return files.includes(file) || file.startsWith(GENERATED) || before.get(key) === after.get(key);
  });
}

// The skill's scanner rules for one slice. Returns null on a pass.
export function signalProblem(slice, beforeReport, afterReport) {
  const before = counts(beforeReport);
  const after = counts(afterReport);
  // Text the scanner does not flag cannot lower a count; the tests and the
  // session's diff check are all that verify it, and the report says so.
  if (slice.kind === "reword" && slice.signals.length === 0) {
    return null;
  }
  if (slice.kind === "reword") {
    const was = total(before, slice.files, slice.signals);
    const now = total(after, slice.files, slice.signals);
    return now < was ? null : `the target signals did not drop (${was} before, ${now} after)`;
  }
  if (slice.kind === "agents") {
    return null;
  }
  const removed = delta(bySignal(before, slice.from), bySignal(after, slice.from));
  const added = delta(bySignal(after, slice.to), bySignal(before, slice.to));
  if (!same(removed, added)) {
    return `signals removed from ${slice.from.join(", ")} (${format(removed)}) do not equal those added to ${slice.to.join(", ")} (${format(added)})`;
  }
  if (!untouchedElsewhere(before, after, [...slice.from, ...slice.to])) {
    return "scanner findings changed in files outside the move";
  }
  if (slice.kind === "reduce-claude" && afterReport.claudeAdapter !== "canonical") {
    return `claudeAdapter reads ${afterReport.claudeAdapter}, not canonical`;
  }
  return null;
}

function changedPaths(repo) {
  const out = git(repo, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
  const fields = out.split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    paths.push({ code: field.slice(0, 2), path: field.slice(3) });
    if (field[0] === "R" || field[0] === "C") {
      index += 1;
      paths.push({ code: "D ", path: fields[index] });
    }
  }
  return paths;
}

function scopeProblem(slice, repo) {
  const changes = changedPaths(repo);
  if (changes.some((change) => change.path.startsWith(GENERATED))) {
    return "the session edited generated agent TOML by hand";
  }
  if (changes.some((change) => change.path === "CLAUDE.md" && change.code.includes("D"))) {
    return "the session deleted CLAUDE.md; it is reduced to an @AGENTS.md import, never deleted";
  }
  const outside = changes.filter(
    (change) => !slice.files.includes(change.path) && !slice.files.some((file) => change.path.startsWith(`${file}/`)),
  );
  return outside.length > 0
    ? `changed files outside the slice: ${outside.map((change) => change.path).join(", ")}`
    : null;
}

function touchesAgents(slice, agentSource) {
  return (
    slice.kind === "agents" || (agentSource !== "" && slice.files.some((file) => file.startsWith(`${agentSource}/`)))
  );
}

// Generate, then check; a drift after one regeneration stops the slice.
function converterProblem(state, options) {
  if (state.agentSource === "") {
    return "the proposal names no Claude agent directory to convert";
  }
  const base = [
    options.converter,
    `--source=${state.agentSource}`,
    `--output=${join(options.repo, ".codex", "agents")}`,
  ];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const generated = run(process.execPath, base, options.repo);
    if (generated.status !== 0) {
      return `the converter failed: ${generated.stderr.trim()}`;
    }
    if (run(process.execPath, [...base, "--check"], options.repo).status === 0) {
      return null;
    }
  }
  return "the converter --check still reports drift after a regeneration";
}

function testProblem(test, repo) {
  if (test === "") {
    return null;
  }
  const result = run("bash", ["-c", test], repo);
  return result.status === 0
    ? null
    : `the documented test command failed: ${test}\n${(result.stdout + result.stderr).slice(-2000)}`;
}

function revertAll(repo, head) {
  git(repo, ["reset", "-q", "--hard", head]);
  git(repo, ["clean", "-fdq"]);
}

function verifySlice(slice, state, options) {
  if (git(options.repo, ["rev-parse", "HEAD"]).trim() !== state.head) {
    return { problem: "the session made a commit; the workflow commits each slice itself" };
  }
  const scope = scopeProblem(slice, options.repo);
  if (scope) {
    return { problem: scope };
  }
  if (touchesAgents(slice, state.agentSource)) {
    const converter = converterProblem(state, options);
    if (converter) {
      return { problem: converter };
    }
  }
  const after = scan(options.repo, options.scanner);
  const signals = signalProblem(slice, state.before, after);
  if (signals) {
    return { problem: signals };
  }
  return { problem: testProblem(state.test, options.repo) };
}

function commitSlice(slice, repo, dir) {
  if (changedPaths(repo).length === 0) {
    return { status: "failed", reason: "the session changed nothing" };
  }
  git(repo, ["add", "-A"]);
  const message = join(dir, "slice-message.txt");
  writeFileSync(
    message,
    `codex-migrate: ${slice.label}\n\nSlice ${slice.id} (${slice.kind}), applied and verified by the dod-guard\ncodex-migrate workflow.\n`,
  );
  git(repo, ["commit", "-q", "-F", message]);
  return { status: "applied", commit: git(repo, ["rev-parse", "HEAD"]).trim() };
}

// Returns true once every approved slice has a result.
export function advance(options) {
  const state = readJson(statePath(options.dir));
  const slice = state.slices.find((candidate) => candidate.id === state.current);
  if (slice) {
    let result;
    try {
      const { problem } = verifySlice(slice, state, options);
      result = problem ? { status: "failed", reason: problem } : commitSlice(slice, options.repo, options.dir);
    } catch (error) {
      result = { status: "failed", reason: error.message };
    }
    if (result.status !== "applied") {
      revertAll(options.repo, state.head);
    }
    state.results[slice.id] = result;
  }
  queueNext(options.dir, state, options);
  return state.current === null;
}

// ---------------------------------------------------------------- report

export function report({ dir }) {
  const items = readJson(join(dir, "items.json"));
  const state = existsSync(statePath(dir)) ? readJson(statePath(dir)) : { queue: [], results: {} };
  const out = ["## Codex migration", ""];
  out.push("### Slices", "");
  for (const slice of items.slices) {
    const result = state.results[slice.id];
    const status = result ? result.status : "not approved";
    const detail = result?.commit ? ` in ${result.commit.slice(0, 10)}` : result?.reason ? `: ${result.reason}` : "";
    const unflagged =
      result?.commit && slice.kind === "reword" && slice.signals.length === 0
        ? "; the scanner flags none of this text, so only the tests and the diff check verified it"
        : "";
    out.push(`- ${slice.id} ${slice.label} (${slice.kind}): ${status}${detail}${unflagged}`);
  }
  if (items.slices.length === 0) {
    out.push("- The proposal named no slice.");
  }
  for (const entry of items.rejected) {
    out.push(`- ${entry.id} ${entry.label}: not offered, ${entry.problem}`);
  }
  out.push("", "### Not observed", "");
  out.push(
    "- Neither runtime was asked to name its active instruction sources; open Codex and Claude in this checkout to confirm.",
  );
  if (items.test === "") {
    out.push("- The project documents no test command, so no slice claims a test pass.");
  }
  const proposal = join(dir, "proposal.md");
  if (existsSync(proposal)) {
    out.push("", "### Proposal", "", readFileSync(proposal, "utf8").trim());
  }
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
  options: (args) => ({ out: JSON.stringify(options(args)), code: 0 }),
  approve: (args) => ({ out: JSON.stringify(approve(args)), code: 0 }),
  advance: (args) => ({ out: "", code: advance(args) ? 0 : 1 }),
  report: (args) => ({ out: report(args).trimEnd(), code: 0 }),
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const command = COMMANDS[args.command];
    if (!command) {
      throw new Error(`unknown command: ${args.command}`);
    }
    const { out, code } = command(args);
    if (out !== "") {
      process.stdout.write(`${out}\n`);
    }
    process.exit(code);
  } catch (error) {
    process.stderr.write(`migrate: ${error.message}\n`);
    process.exit(2);
  }
}
