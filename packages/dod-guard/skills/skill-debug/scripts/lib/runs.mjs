// Where one run of a skill ends. The transcript never says, so this decides it.
//
// Two events end a run. Calling the same skill again starts a new one. A
// /clear wipes the context the skill was living in, so what follows belongs to
// no run at all. Everything else stays inside, including calls the skill makes
// to other skills, because those are part of what it did.
//
// The boundary is reported with the run. A reader who disagrees with it can
// see what was used.

import {
  findInvocations,
  normalizeSkill,
  skillMatches,
} from "./invocations.mjs";

const RESET = "clear";

function endsRun(invocation, skill) {
  if (skillMatches(invocation.name, skill)) {
    return true;
  }
  return normalizeSkill(invocation.name) === RESET;
}

function boundaryFor(invocations, position, skill, total) {
  const rest = invocations.slice(position + 1);
  const next = rest.find((entry) => endsRun(entry, skill));
  if (!next) {
    return { end: total, reason: "end of transcript" };
  }
  const again = skillMatches(next.name, skill);
  return { end: next.index, reason: again ? "a second call" : "a /clear" };
}

export function findRuns(records, skill) {
  const invocations = findInvocations(records);
  const runs = [];
  invocations.forEach((invocation, position) => {
    if (!skillMatches(invocation.name, skill)) {
      return;
    }
    const total = records.length;
    const { end, reason } = boundaryFor(invocations, position, skill, total);
    runs.push({
      ...invocation,
      start: invocation.index,
      end,
      boundary: reason,
    });
  });
  return runs;
}
