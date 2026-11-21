// The target and gather steps: find the skill's SKILL.md in the checkout, and
// pull its past runs' traces through skill-debug's find-runs.mjs and
// extract-run.mjs into the artifacts directory.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bareName, forbidden, git, node, writeJson } from "./common.mjs";

const FOUND = 0;
const NOTHING = 4;
// Index rows scanned to find the runs to pull, and runs pulled at most.
const INDEX_LIMIT = 50;
const MAX_RUNS = 6;
const MAX_SESSION_RUNS = 50;

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

function failed(script, result) {
  return new Error(`${script} exited ${result.status}: ${result.stderr}`);
}

function extractRun(scripts, { session, skill, run, maxSteps }) {
  return node(join(scripts, "extract-run.mjs"), [
    `--session=${session}`,
    `--skill=${skill}`,
    `--run=${run}`,
    `--max-steps=${maxSteps}`,
  ]);
}

// Every run of the skill in one session, in the order extract-run numbers them.
function sessionRuns(scripts, session, skill) {
  const runs = [];
  for (let run = 1; run <= MAX_SESSION_RUNS; run += 1) {
    const result = extractRun(scripts, { session, skill, run, maxSteps: 1 });
    if (result.status === NOTHING) {
      break;
    }
    if (result.status !== FOUND) {
      throw failed("extract-run.mjs", result);
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
      throw failed("find-runs.mjs", result);
    }
  }
  return { days: days * 12, text: "" };
}

function runCount(runs) {
  return Math.min(Math.max(Number(runs) || 3, 2), MAX_RUNS);
}

function cachedRuns(cache, scripts, session, skill) {
  if (!cache.has(session)) {
    cache.set(session, sessionRuns(scripts, session, skill));
  }
  return cache.get(session);
}

function pulledRuns(traces, session) {
  return new Set(traces.filter((trace) => trace.session === session).map((trace) => trace.run));
}

// The session's run an index row names, skipping runs already pulled. Two
// runs can start in the same minute, so the step count decides.
function matchRun(runs, row, used) {
  return runs.find((run) => run.started === row.when && run.steps === row.steps && !used.has(run.run));
}

// The full trace, so no late phase is scored from a truncated one.
function pullTrace({ dir, scripts, skill, row, match, k }) {
  const full = extractRun(scripts, {
    session: row.session,
    skill,
    run: match.run,
    maxSteps: Math.max(match.steps, 1),
  });
  if (full.status !== FOUND) {
    throw failed("extract-run.mjs", full);
  }
  const file = `trace-${k}.txt`;
  writeFileSync(join(dir, file), full.stdout);
  return {
    k,
    session: row.session,
    run: match.run,
    project: row.project,
    started: row.when,
    steps: match.steps,
    file,
  };
}

export function gather({ dir, skill, days = "30", runs = "3", scripts }) {
  const name = bareName(skill);
  const found = findRuns(scripts, name, Number(days) || 30);
  writeFileSync(join(dir, "runs.txt"), found.text || `no run of ${name} in ${found.days} days\n`);
  const cache = new Map();
  const traces = [];
  for (const row of indexRows(found.text).slice(0, runCount(runs))) {
    const sessionList = cachedRuns(cache, scripts, row.session, name);
    const match = matchRun(sessionList, row, pulledRuns(traces, row.session));
    if (match) {
      traces.push(pullTrace({ dir, scripts, skill: name, row, match, k: traces.length + 1 }));
    }
  }
  writeJson(join(dir, "traces.json"), { skill: name, days: found.days, traces });
  if (traces.length === 0) {
    throw new Error(`no run of ${name} in ${found.days} days, so there is nothing to score`);
  }
  return String(traces.length);
}
