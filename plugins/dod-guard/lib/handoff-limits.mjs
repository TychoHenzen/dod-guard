// The size limits of the one `## Implementation handoff` comment. That comment
// holds three records: the task lines and acceptance matrix that next-ticket
// builds, the `## Preflight checkpoint` that submit-draft-pr writes, and the
// `## Conflict triage` that complete-pr appends. Every part that can vary has a
// limit here, so the largest comment the format allows is known, and
// skills/next-ticket/scripts/handoff-cap.test.mjs builds that comment and
// checks it fits CAPS.handoff.
// Counts and ids come from the issue body, so the refinement proof applies them
// before any work starts. Lines are written during the work, so the writer of
// each one refuses a longer one and asks for it shorter, never cut.

// ASSUMPTION: set on 2026-11-27 from 15 handoffs that handoff-build.mjs printed
// (tasks at most 10, rows at most 14, ids at most 7 characters, checkpoints at
// most 2740 characters) and one conflict triage (4 answers, 7 checks).
const HANDOFF_LIMITS = Object.freeze({
  // Planned tasks in the issue body's task list, one handoff line each.
  tasks: 12,
  // Planned rows in the issue body's planned acceptance matrix.
  rows: 16,
  // A task id, row id or row contract (acceptance criterion id).
  id: 16,
  // ASSUMPTION: a task line is its id, commit and a one- or two-sentence
  // result of about 250 characters. Measured results had a median of 281; the
  // first task's line also carries the start-state values.
  taskLine: 280,
  // ASSUMPTION: a matrix row as JSON is its id, criterion id, status and a one-
  // or two-sentence observation of about 220 characters. Measured observations
  // had a median of 179 and a 90th percentile of 628.
  rowLine: 280,
  // The whole `## Preflight checkpoint` section, heading included. The rows
  // are one per required check, so this holds about eleven of them.
  checkpoint: 3000,
});

// ASSUMPTION: the one real triage had 1 conflict, 1 basis, 4 answers of about
// 230 characters and 7 checks of about 120; these limits ask for each line to
// cite path:line instead of quoting, as the other GitHub texts do.
const TRIAGE_LIMITS = Object.freeze({
  // Conflicted paths one triage takes, one line each. A merge with more stops
  // when it starts, before any work, since git names the paths.
  conflicts: 8,
  // One conflicted path, checked when the merge starts for the same reason.
  path: 160,
  // Distinct bases the judge states, each once.
  bases: 3,
  // Investigator answer lines.
  answers: 4,
  // Verification result lines.
  verification: 5,
  // Any one line of the record: a conflict (a path of at most 160 characters
  // with its class, decision, basis id and question ids), a basis, an answer,
  // a check, or the stop and decision-needed lines.
  line: 240,
});

// Returns null when text fits, else a sentence naming its size and the limit.
function lineProblem(label, text, limit) {
  const { length } = String(text);
  if (length <= limit) {
    return null;
  }
  return `${label} is ${length} characters, over the ${limit}-character limit; write it shorter, do not cut it off`;
}

function countProblem(label, items, limit) {
  if (!Array.isArray(items) || items.length <= limit) {
    return null;
  }
  return `${label} has ${items.length} entries, over the ${limit} the handoff holds; split the PBI`;
}

function idProblems(label, entries, field) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => entry?.[field])
    .filter((id) => typeof id === "string" && id.length > HANDOFF_LIMITS.id)
    .map((id) => `${label} ${field} ${id} is longer than ${HANDOFF_LIMITS.id} characters`);
}

// The body-side limits on the parsed issue body records, one message each.
// The refinement proof and handoff-build.mjs both apply them.
function bodyLimitProblems(input) {
  const tasks = input?.tasks;
  const rows = input?.plannedAcceptanceMatrix;
  return [
    countProblem("task-list", tasks, HANDOFF_LIMITS.tasks),
    countProblem("planned-acceptance-matrix", rows, HANDOFF_LIMITS.rows),
    ...idProblems("task", tasks, "id"),
    ...idProblems("planned row", rows, "id"),
    ...idProblems("planned row", rows, "contract"),
  ].filter(Boolean);
}

export { bodyLimitProblems, HANDOFF_LIMITS, lineProblem, TRIAGE_LIMITS };
