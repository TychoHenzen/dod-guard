#!/usr/bin/env node
// The deterministic steps of the skill-debug workflow. Facts about past runs
// come only from skill-debug's own find-runs.mjs and extract-run.mjs; this
// script chooses which runs to pull, checks every finding cites a step that
// exists, and verifies and commits each accepted edit.
//
//   target  --dir --repo --skill=<name>                          find the skill's SKILL.md in the checkout
//   gather  --dir --skill --days --runs --scripts=<dir>          pull traces into the artifacts
//   options --dir --repo                                         validate findings.json; print the form
//   approve --dir --repo --answer=<json>                         record the answer, queue the first finding
//   advance --dir --repo                                         verify the edit, commit or revert it, queue
//                                                                the next; exit 0 once none is left
//   report  --dir                                                write and print the pull request body
//
// Exit 2 on any error.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const OPTION = /^--([\w-]+)=(.*)$/s;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const CITE = /run (\d+) steps? (\d+)(?:\s*-\s*(\d+))?/g;
export const NONE = "none";
export const CAUSES = new Set([
  "missing step",
  "ambiguous wording",
  "ignored instruction",
  "escape hatch",
  "broken script",
  "wrong altitude",
  "lost late",
]);
const FOUND = 0;
const NOTHING = 4;
// Index rows scanned to find the runs to pull, and runs pulled at most.
const INDEX_LIMIT = 50;
const MAX_RUNS = 6;
const MAX_SESSION_RUNS = 50;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function git(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function node(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

export function bareName(skill) {
  return String(skill).replace(/^\//, "").split(":").pop();
}

function forbidden(path) {
  return /(^|\/)\.claude\/plugins\//.test(path);
}

// ---------------------------------------------------------------- target

export function target({ dir, repo, skill }) {
  const name = bareName(skill);
  const matches = git(repo, ["ls-files", "-z"])
    .split("\0")
    .filter((path) => path === `skills/${name}/SKILL.md` || path.endsWith(`/skills/${name}/SKILL.md`))
    .filter((path) => !forbidden(path));
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `this checkout tracks no skills/${name}/SKILL.md; run the workflow in the skill's source repository`
        : `more than one SKILL.md for ${name}: ${matches.join(", ")}`,
    );
  }
  writeJson(join(dir, "target.json"), { skill: name, path: matches[0] });
  return matches[0];
}

// ---------------------------------------------------------------- gather

// Index rows: "1    2026-10-17 07:23  7f3681b3  <project>", then on the next
// line "       144 steps, 6 user, 1 err".
export function indexRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^(\d+)\s+(\S+ \S+|unknown time)\s+(\S+)\s+(\S+)/.exec(line);
    const counts = /^\s+(\d+) steps,/.exec(line);
    if (match) {
      rows.push({ when: match[2], session: match[3], project: match[4], steps: -1 });
    } else if (counts && rows.length > 0) {
      rows[rows.length - 1].steps = Number(counts[1]);
    }
  }
  return rows;
}

function header(text) {
  const started = /^started (\S+ \S+|unknown time)/m.exec(text);
  const steps = /^steps (\d+)/m.exec(text);
  return { started: started ? started[1] : "", steps: steps ? Number(steps[1]) : 0 };
}

// Every run of the skill in one session, in the order extract-run numbers them.
function sessionRuns(scripts, session, skill) {
  const runs = [];
  for (let run = 1; run <= MAX_SESSION_RUNS; run += 1) {
    const result = node(join(scripts, "extract-run.mjs"), [
      `--session=${session}`,
      `--skill=${skill}`,
      `--run=${run}`,
      "--max-steps=1",
    ]);
    if (result.status === NOTHING) {
      break;
    }
    if (result.status !== FOUND) {
      throw new Error(`extract-run.mjs exited ${result.status}: ${result.stderr}`);
    }
    runs.push({ run, ...header(result.stdout) });
  }
  return runs;
}

function findRuns(scripts, skill, days) {
  // Step 2 of the skill: on exit 4, raise --days before concluding anything.
  for (const window of [days, days * 3, days * 12]) {
    const result = node(join(scripts, "find-runs.mjs"), [
      `--skill=${skill}`,
      `--days=${window}`,
      `--limit=${INDEX_LIMIT}`,
    ]);
    if (result.status === FOUND) {
      return { days: window, text: result.stdout };
    }
    if (result.status !== NOTHING) {
      throw new Error(`find-runs.mjs exited ${result.status}: ${result.stderr}`);
    }
  }
  return { days: days * 12, text: "" };
}

export function gather({ dir, skill, days = "30", runs = "3", scripts }) {
  const name = bareName(skill);
  const wanted = Math.min(Math.max(Number(runs) || 3, 2), MAX_RUNS);
  const found = findRuns(scripts, name, Number(days) || 30);
  writeFileSync(join(dir, "runs.txt"), found.text || `no run of ${name} in ${found.days} days\n`);
  const rows = indexRows(found.text).slice(0, wanted);
  const cache = new Map();
  const traces = [];
  for (const row of rows) {
    if (!cache.has(row.session)) {
      cache.set(row.session, sessionRuns(scripts, row.session, name));
    }
    const used = new Set(traces.filter((trace) => trace.session === row.session).map((trace) => trace.run));
    // Two runs can start in the same minute, so the step count decides.
    const match = cache
      .get(row.session)
      .find((run) => run.started === row.when && run.steps === row.steps && !used.has(run.run));
    if (!match) {
      continue;
    }
    // The full trace, so no late phase is scored from a truncated one.
    const full = node(join(scripts, "extract-run.mjs"), [
      `--session=${row.session}`,
      `--skill=${name}`,
      `--run=${match.run}`,
      `--max-steps=${Math.max(match.steps, 1)}`,
    ]);
    if (full.status !== FOUND) {
      throw new Error(`extract-run.mjs exited ${full.status}: ${full.stderr}`);
    }
    const k = traces.length + 1;
    const file = `trace-${k}.txt`;
    writeFileSync(join(dir, file), full.stdout);
    traces.push({
      k,
      session: row.session,
      run: match.run,
      project: row.project,
      started: row.when,
      steps: match.steps,
      file,
    });
  }
  writeJson(join(dir, "traces.json"), { skill: name, days: found.days, traces });
  if (traces.length === 0) {
    throw new Error(`no run of ${name} in ${found.days} days, so there is nothing to score`);
  }
  return String(traces.length);
}

// ---------------------------------------------------------------- the form

function citeProblem(evidence, traces) {
  const cites = [...String(evidence).matchAll(CITE)];
  if (cites.length === 0) {
    return 'evidence cites no "run <k> steps <a>-<b>"';
  }
  for (const [, k, from, to] of cites) {
    const trace = traces.find((entry) => entry.k === Number(k));
    const last = Number(to ?? from);
    if (!trace) {
      return `evidence cites run ${k}, which was not pulled`;
    }
    if (Number(from) < 1 || last > trace.steps || last < Number(from)) {
      return `evidence cites steps ${from}-${last} of run ${k}, which has ${trace.steps}`;
    }
  }
  return null;
}

function findingProblem(finding, seen, traces, tracked) {
  if (!ID.test(String(finding.id)) || finding.id === NONE || seen.has(finding.id)) {
    return `bad or repeated id ${JSON.stringify(finding.id)}`;
  }
  if (!CAUSES.has(finding.cause)) {
    return `cause ${JSON.stringify(finding.cause)} is not a row of the Causes table`;
  }
  const file = String(finding.file ?? "");
  if (forbidden(file) || !tracked.has(file) || !file.endsWith(".md")) {
    return `file ${JSON.stringify(file)} is not a tracked Markdown file of this checkout`;
  }
  if (String(finding.fix ?? "").trim() === "") {
    return "names no fix";
  }
  return citeProblem(finding.evidence, traces);
}

export function options({ dir, repo }) {
  const { traces } = readJson(join(dir, "traces.json"));
  const raw = readJson(join(dir, "findings.json"));
  const tracked = new Set(git(repo, ["ls-files", "-z"]).split("\0").filter(Boolean));
  const seen = new Set();
  const findings = [];
  const rejected = [];
  for (const finding of Array.isArray(raw.findings) ? raw.findings : []) {
    const problem = findingProblem(finding, seen, traces, tracked);
    seen.add(finding.id);
    const entry = {
      id: String(finding.id),
      title: String(finding.title ?? finding.id),
      cause: String(finding.cause ?? ""),
      file: String(finding.file ?? ""),
      fix: String(finding.fix ?? ""),
      expect: String(finding.expect ?? "").trim(),
    };
    if (problem) {
      rejected.push({ ...entry, problem });
    } else {
      findings.push(entry);
    }
  }
  writeJson(join(dir, "items.json"), { findings, rejected });
  const choices = findings.map((finding) => ({
    id: finding.id,
    label: finding.title,
    does: `${finding.cause}: edit ${finding.file}`,
  }));
  choices.push({ id: NONE, label: "Accept nothing", does: "end the run with no edit" });
  const rejectedLines = rejected.map((entry) => `${entry.id}: not offered, ${entry.problem}`);
  const intro = `Pick the findings to apply; each becomes one edit and one commit. The full report, with evidence, is in ${join(dir, "report.md")}.`;
  const blocks = findings.map(
    (finding) => `${finding.id}: ${finding.title} (${finding.cause})\n  file: ${finding.file}\n  fix: ${finding.fix}`,
  );
  return {
    options: choices,
    count: String(findings.length),
    message: [intro, ...blocks, ...rejectedLines].join("\n\n"),
  };
}

// ---------------------------------------------------------------- edits

function statePath(dir) {
  return join(dir, "state.json");
}

function queueNext(dir, repo, state) {
  const next = state.queue.find((id) => !(id in state.results));
  state.current = next ?? null;
  state.head = git(repo, ["rev-parse", "HEAD"]).trim();
  const currentPath = join(dir, "current.json");
  rmSync(currentPath, { force: true });
  if (next) {
    writeJson(
      currentPath,
      state.findings.find((finding) => finding.id === next),
    );
  }
  writeJson(statePath(dir), state);
}

export function approve({ dir, repo, answer }) {
  const { findings } = readJson(join(dir, "items.json"));
  const decisions = JSON.parse(answer)?.decisions;
  const picked = Array.isArray(decisions) && !decisions.includes(NONE) ? new Set(decisions) : new Set();
  const queue = findings.filter((finding) => picked.has(finding.id)).map((finding) => finding.id);
  queueNext(dir, repo, { findings, queue, results: {}, current: null, head: "" });
  return { count: String(queue.length) };
}

function changed(repo) {
  const fields = git(repo, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]).split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    paths.push(fields[index].slice(3));
    if (fields[index][0] === "R" || fields[index][0] === "C") {
      index += 1;
      paths.push(fields[index]);
    }
  }
  return paths;
}

function verify(finding, repo, state) {
  if (git(repo, ["rev-parse", "HEAD"]).trim() !== state.head) {
    return "the session made a commit; the workflow commits each edit itself";
  }
  const paths = changed(repo);
  if (paths.length === 0) {
    return "the session changed nothing";
  }
  const outside = paths.filter((path) => path !== finding.file);
  if (outside.length > 0) {
    return `changed files besides ${finding.file}: ${outside.join(", ")}`;
  }
  return existsSync(join(repo, finding.file)) ? null : `the session deleted ${finding.file}`;
}

// Returns true once every accepted finding has a result.
export function advance({ dir, repo }) {
  const state = readJson(statePath(dir));
  const finding = state.findings.find((candidate) => candidate.id === state.current);
  if (finding) {
    let result;
    try {
      const problem = verify(finding, repo, state);
      if (problem) {
        result = { status: "failed", reason: problem };
      } else {
        git(repo, ["add", "--", finding.file]);
        const message = join(dir, "edit-message.txt");
        writeFileSync(
          message,
          `skill-debug: ${finding.title}\n\nCause: ${finding.cause}. Accepted in the dod-guard skill-debug workflow.\n`,
        );
        git(repo, ["commit", "-q", "-F", message]);
        result = { status: "applied", commit: git(repo, ["rev-parse", "HEAD"]).trim() };
      }
    } catch (error) {
      result = { status: "failed", reason: error.message };
    }
    if (result.status !== "applied") {
      git(repo, ["reset", "-q", "--hard", state.head]);
      git(repo, ["clean", "-fdq"]);
    }
    state.results[finding.id] = result;
  }
  queueNext(dir, repo, state);
  return state.current === null;
}

// ---------------------------------------------------------------- report

// The pull request body. It names findings, causes and files only: quoted
// trace lines stay in the local artifacts, never in a public write.
export function report({ dir }) {
  const items = readJson(join(dir, "items.json"));
  const { skill, traces } = readJson(join(dir, "traces.json"));
  const state = existsSync(statePath(dir)) ? readJson(statePath(dir)) : { results: {} };
  const out = [`## Skill debug: ${skill}`, "", `Scored against ${traces.length} past runs.`, "", "### Findings", ""];
  for (const finding of items.findings) {
    const result = state.results[finding.id];
    const status = result ? result.status : "not accepted";
    const detail = result?.commit ? ` in ${result.commit.slice(0, 10)}` : result?.reason ? `: ${result.reason}` : "";
    out.push(`- ${finding.title} (${finding.cause}, ${finding.file}): ${status}${detail}`);
  }
  if (items.findings.length === 0) {
    out.push("- No finding was offered.");
  }
  for (const entry of items.rejected) {
    out.push(`- ${entry.title}: not offered, ${entry.problem}`);
  }
  const expected = items.findings.filter((finding) => state.results[finding.id]?.commit && finding.expect !== "");
  if (expected.length > 0) {
    out.push("", "### If the applied fixes hold", "");
    for (const finding of expected) {
      out.push(`- ${finding.title}: ${finding.expect}`);
    }
  }
  const text = `${out.join("\n")}\n`;
  writeFileSync(join(dir, "pr-body.md"), text);
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
  target: (args) => ({ out: target(args), code: 0 }),
  gather: (args) => ({ out: gather(args), code: 0 }),
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
    process.stderr.write(`debug: ${error.message}\n`);
    process.exit(2);
  }
}
