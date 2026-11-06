// Executes a closure plan through the GitHub REST API. Every write is preceded
// by a live read and followed by a readback; a disagreement stops with the
// observed partial state and no further write.
import { writeClose } from "./closure-close.mjs";
import { repairDone, writeDone } from "./closure-done.mjs";
import { planClosures } from "./closure-plan.mjs";
import { ClosureStop } from "./closure-stop.mjs";

const PROJECT_KEYS = ["owner", "number", "statusFieldId", "doneOptionId"];

function requireProject(project) {
  if (!(project && PROJECT_KEYS.every((key) => project[key]))) {
    throw new ClosureStop("snapshot.project needs owner, number, statusFieldId, and doneOptionId", { applied: [] });
  }
  return project;
}

// The stop carries the failed write's state and what this run already finished, so the
// caller sees where a rerun resumes.
function attempt(write, issue, progress) {
  try {
    write();
  } catch (error) {
    throw new ClosureStop(error.message, { ...(error.state ?? { issue }), ...progress });
  }
}

function closeAndMarkDone(writer, close) {
  writeClose(writer, close);
  writeDone(writer, close);
}

function applyClosures(snapshot, { runner, ...options }) {
  const plan = planClosures(snapshot, options);
  const steps = [];
  const applied = [];
  const repaired = [];
  if (plan.closes.length === 0 && plan.statusRepairs.length === 0) return { applied, repaired, steps, plan };
  const writer = { runner, repository: plan.repository, project: requireProject(snapshot.project), steps };
  const progress = { applied, repaired, steps };
  for (const close of plan.closes) {
    attempt(() => closeAndMarkDone(writer, close), close.issue, progress);
    applied.push(close.issue);
  }
  for (const repair of plan.statusRepairs) {
    attempt(() => repairDone(writer, repair), repair.issue, progress);
    repaired.push(repair.issue);
  }
  return { applied, repaired, steps, plan };
}

export { applyClosures };
