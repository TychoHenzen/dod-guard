// Picks the one evidence run for each required context from the workflow runs listed for one head, so a
// workflow that ran for both push and pull_request is one preflight row. Every function is pure.
const PULL_REQUEST = "pull_request";

function isNonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

function isRun(run) {
  return typeof run === "object" && run !== null && isNonEmptyString(run.context) && isNonEmptyString(run.event);
}

function differs(runs, key) {
  return new Set(runs.map((run) => run[key])).size > 1;
}

function firstRepeated(values) {
  return values.find((value, index) => values.indexOf(value) !== index);
}

function sourceStop(context, runs) {
  if (differs(runs, "headSha")) {
    return `required context ${context} has runs bound to different heads`;
  }
  if (differs(runs, "workflow") || differs(runs, "provider")) {
    return `required context ${context} has runs from more than one workflow`;
  }
  return null;
}

function eventStop(context, runs) {
  const events = runs.map((run) => run.event);
  const repeated = firstRepeated(events);
  if (repeated !== undefined) {
    return `required context ${context} has more than one ${repeated} run`;
  }
  if (!events.includes(PULL_REQUEST)) {
    return `required context ${context} has ${events.join(" and ")} runs but no ${PULL_REQUEST} run`;
  }
  return null;
}

// Returns the sentence that stops this context, or null when its runs collapse to one row.
function stopFor(context, runs) {
  if (runs.length === 1) {
    return null;
  }
  return sourceStop(context, runs) ?? eventStop(context, runs);
}

function withoutEvent(run) {
  return Object.fromEntries(Object.entries(run).filter(([key]) => key !== "event"));
}

function groupByContext(runs) {
  const groups = new Map();
  for (const run of runs) {
    groups.set(run.context, [...(groups.get(run.context) ?? []), run]);
  }
  return groups;
}

function collapseGroup([context, runs]) {
  const problem = stopFor(context, runs);
  if (problem !== null) {
    return { problem };
  }
  return { row: withoutEvent(runs.length === 1 ? runs[0] : runs.find((run) => run.event === PULL_REQUEST)) };
}

// Returns { rows, problems }: one row per context in first-seen order, and one sentence per context or run
// that cannot be collapsed. A caller writes the rows only when problems is empty.
function collapseContextRuns(runs) {
  if (runs.length === 0) {
    return { rows: [], problems: ["no runs to collapse"] };
  }
  const malformed = runs.findIndex((run) => !isRun(run));
  if (malformed >= 0) {
    return { rows: [], problems: [`run ${malformed + 1} is malformed`] };
  }
  const results = [...groupByContext(runs)].map(collapseGroup);
  return {
    rows: results.flatMap(({ row }) => (row ? [row] : [])),
    problems: results.flatMap(({ problem }) => (problem ? [problem] : [])),
  };
}

export { collapseContextRuns };
