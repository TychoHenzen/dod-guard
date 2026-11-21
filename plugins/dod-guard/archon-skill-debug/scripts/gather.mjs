// The target and gather steps: find the skill's SKILL.md in the checkout, and
// pull its past runs' traces through skill-debug's find-runs.mjs and
// extract-run.mjs into the artifacts directory.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
// Read only: the transcript lookup extract-run itself uses, so a prefix is
// resolved against the same root.
import { listTranscripts, projectsRoot } from "../../skills/skill-debug/scripts/lib/sessions.mjs";
import { bareName, forbidden, git, node, writeJson } from "./common.mjs";

const FOUND = 0;
const NOTHING = 4;
// Index rows scanned to find the runs to pull, and runs pulled at most.
const INDEX_LIMIT = 50;
const MAX_RUNS = 6;
// A run number no session reaches, so extract-run answers with the count.
const PAST_THE_END = Number.MAX_SAFE_INTEGER;

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

// How many runs of the skill one session holds. Asked for a run past the end,
// extract-run exits 4 and names the count.
function runTotal(scripts, session, skill) {
  const result = extractRun(scripts, { session, skill, run: PAST_THE_END, maxSteps: 1 });
  const total = /^(\d+) runs of /m.exec(result.stderr);
  if (result.status !== NOTHING || !total) {
    throw failed("extract-run.mjs", result);
  }
  return Number(total[1]);
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

// The extract-run number of each index row. find-runs lists a session's runs
// newest first and extract-run numbers them oldest first, so a row's place
// among its session's rows names its run. The minute and step count shown in
// a row cannot: several runs can share both.
// ASSUMPTION: no two runs of one session share an exact start timestamp; a
// tie keeps transcript order in find-runs' sort and would swap the pair.
function runNumbers(scripts, skill, rows) {
  const totals = new Map();
  const newer = new Map();
  return rows.map(({ path }) => {
    if (!totals.has(path)) {
      totals.set(path, runTotal(scripts, path, skill));
    }
    const above = newer.get(path) ?? 0;
    newer.set(path, above + 1);
    return totals.get(path) - above;
  });
}

// The transcript an index row names. The index prints only the first 8
// characters of a session id, so the prefix is looked up among the
// transcripts, narrowed by the row's project when it matches several, and
// never guessed between.
function transcriptOf(entries, row) {
  const named = entries.filter((entry) => entry.session.startsWith(row.session));
  const chosen = named.length > 1 ? named.filter((entry) => entry.project === row.project) : named;
  if (chosen.length === 1) {
    return chosen[0];
  }
  const ids = chosen.map((entry) => entry.session).join(", ");
  throw new Error(
    chosen.length === 0
      ? `session ${row.session} in ${row.project} matches no transcript under ${projectsRoot()}`
      : `session ${row.session} in ${row.project} matches ${chosen.length} transcripts: ${ids}; ` +
          "the index cannot say which one ran the skill",
  );
}

function locate(rows) {
  const entries = listTranscripts(projectsRoot(), Number.MAX_SAFE_INTEGER);
  return rows.map((row) => {
    const { path, session } = transcriptOf(entries, row);
    return { ...row, path, session };
  });
}

function extracted(scripts, args) {
  const result = extractRun(scripts, args);
  if (result.status !== FOUND) {
    throw failed("extract-run.mjs", result);
  }
  return result.stdout;
}

// The full trace, so no late phase is scored from a truncated one. The row's
// minute and step count only cross-check the run its position named.
function pullTrace({ dir, scripts, skill, row, run, k }) {
  const args = { session: row.path, skill, run };
  const head = header(extracted(scripts, { ...args, maxSteps: 1 }));
  if (head.started !== row.when || head.steps !== row.steps) {
    throw new Error(
      `run ${run} of session ${row.session} started ${head.started} with ${head.steps} steps, ` +
        `but the index row says ${row.when} with ${row.steps}; the index and the session disagree, so gather again`,
    );
  }
  const file = `trace-${k}.txt`;
  writeFileSync(join(dir, file), extracted(scripts, { ...args, maxSteps: Math.max(head.steps, 1) }));
  return { k, session: row.session, run, project: row.project, started: row.when, steps: head.steps, file };
}

export function gather({ dir, skill, days = "30", runs = "3", scripts }) {
  const name = bareName(skill);
  const found = findRuns(scripts, name, Number(days) || 30);
  writeFileSync(join(dir, "runs.txt"), found.text || `no run of ${name} in ${found.days} days\n`);
  const rows = locate(indexRows(found.text).slice(0, runCount(runs)));
  const numbers = runNumbers(scripts, name, rows);
  const traces = rows.map((row, i) => pullTrace({ dir, scripts, skill: name, row, run: numbers[i], k: i + 1 }));
  writeJson(join(dir, "traces.json"), { skill: name, days: found.days, traces });
  if (traces.length === 0) {
    throw new Error(`no run of ${name} in ${found.days} days, so there is nothing to score`);
  }
  return String(traces.length);
}
