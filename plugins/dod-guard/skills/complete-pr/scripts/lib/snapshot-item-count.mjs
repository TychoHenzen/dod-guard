import { LINKED_PROJECT_READ } from "../../../../lib/linked-project-read.mjs";
import { readFailure } from "./snapshot-failure.mjs";
import { isArchivedItem } from "./snapshot-items.mjs";

// The Project's own item count, read in the same GraphQL answer that named the Project.
function expectedItemCount(project) {
  if (!Number.isInteger(project.itemCount)) {
    throw readFailure(LINKED_PROJECT_READ, `Project #${project.number} did not report items.totalCount`);
  }
  return project.itemCount;
}

// ASSUMPTION: docs do not say whether GraphQL totalCount or the REST list counts archived items, so the raw
// row count or the non-archived row count may equal it. Any other difference is an incomplete read.
export function requireCompleteItems(rows, project, endpoint) {
  const expected = expectedItemCount(project);
  const unarchived = rows.filter((raw) => !isArchivedItem(raw)).length;
  if (rows.length !== expected && unarchived !== expected) {
    const detail = `item list is incomplete: read ${rows.length}, Project reports ${expected}`;
    throw readFailure(endpoint, detail);
  }
}
