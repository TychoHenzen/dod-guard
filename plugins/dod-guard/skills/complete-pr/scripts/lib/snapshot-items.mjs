import { contentRepository, PULL_REQUEST_CONTENT_TYPE } from "./project-reads.mjs";
import { projectRead, readFailure, readPages, siteFailure } from "./snapshot-failure.mjs";
import { contentNumber, fieldValue, parentValue, repositoryValue } from "./snapshot-field-values.mjs";
import { readStatusName } from "./snapshot-fields.mjs";
import { linkedPullValues, pullReference } from "./snapshot-pull-reference.mjs";
import { isObject, nonBlank, positiveInteger } from "./snapshot-values.mjs";

// Archived items are out of the closure scope. The REST default that already
// leaves them out is not relied on.
function isArchivedItem(raw) {
  return isObject(raw) && raw.archived_at !== null && raw.archived_at !== undefined;
}

// A pull request Project item sits outside the issue hierarchy. Its REST content has no repository key,
// it has no issue record, and select-next would hold on it forever. The pull request records the snapshot
// lists come from the Linked pull requests value of Issue items, never from a PullRequest item.
function isPullRequestItem(raw) {
  return isObject(raw) && raw.content_type === PULL_REQUEST_CONTENT_TYPE;
}

function isItemEntry(raw) {
  return isObject(raw) && nonBlank(raw.node_id) && positiveInteger(raw.id);
}

function itemContent(raw, site) {
  const content = raw.content ?? {};
  if (!isObject(content)) {
    throw siteFailure(site, "has content that is not an object");
  }
  return content;
}

function itemFields({ field, pulls, site }, [statusId, repositoryId, parentId]) {
  return [
    { name: "Status", value: readStatusName(field(statusId), `${site.subject} Status`, site.endpoint) },
    { name: "Repository", value: repositoryValue(field(repositoryId), site) },
    { name: "Parent issue", value: parentValue(field(parentId), site) },
    { name: "Linked pull requests", value: pulls.map((pull) => pullReference(pull, site)) },
  ];
}

// One Project item in the snapshot's shape. It keeps the raw content and linked pull request objects
// too, because the issue and pull request records are built from them.
function shapeItem(raw, fieldIds, endpoint) {
  if (!isItemEntry(raw)) {
    throw readFailure(endpoint, "every item must carry a node_id and a numeric id");
  }
  const site = { subject: `item ${raw.node_id}`, endpoint };
  const content = itemContent(raw, site);
  const field = (id) => fieldValue(raw.fields, id, site);
  const pulls = linkedPullValues(field(fieldIds[3]), site);
  const repository = projectRead(() => contentRepository(content, endpoint));
  const header = {
    id: raw.node_id,
    databaseId: raw.id,
    contentType: raw.content_type ?? null,
    repository,
    content: { number: contentNumber(content, site), repository },
  };
  return { item: { ...header, fields: itemFields({ field, pulls, site }, fieldIds) }, content, pulls };
}

export function readShapedItems(read, endpoint, fieldIds) {
  return readPages(read, endpoint)
    .filter((raw) => !isArchivedItem(raw))
    .filter((raw) => !isPullRequestItem(raw))
    .map((raw) => shapeItem(raw, fieldIds, endpoint));
}
