// Sets the Project Done status on a closed issue. Done is written only onto
// an issue that is still closed, because the snapshot may be stale.
import { writeProjectStatuses } from "../project-status.mjs";
import { readIssue } from "./closure-github.mjs";
import { ClosureStop } from "./closure-stop.mjs";

function writeDone({ runner, project, steps }, close) {
  writeProjectStatuses({
    owner: project.owner,
    projectNumber: project.number,
    statusFieldId: project.statusFieldId,
    statusOptionId: project.doneOptionId,
    expectedStatus: "Done",
    itemIds: [close.itemId],
    commandRunner: runner,
  });
  steps.push({ issue: close.issue, step: "project-status" });
}

function requireClosed(live, repair) {
  if (live?.state === "closed") return;
  const state = { issue: repair.issue, state: live?.state ?? null };
  throw new ClosureStop(`issue #${repair.issue} is no longer closed`, state);
}

function requireSameReason(live, repair) {
  if (repair.stateReason === undefined || live.state_reason === repair.stateReason) return;
  const state = { issue: repair.issue, state: live.state, stateReason: live.state_reason ?? null };
  throw new ClosureStop(`issue #${repair.issue} is no longer closed as ${repair.stateReason}`, state);
}

function repairDone(writer, repair) {
  const live = readIssue(writer, repair.issue);
  writer.steps.push({ issue: repair.issue, step: "read" });
  requireClosed(live, repair);
  requireSameReason(live, repair);
  writeDone(writer, repair);
}

export { repairDone, writeDone };
