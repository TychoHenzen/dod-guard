import { statusValueName } from "./project-reads.mjs";
import { messageOf, readFailure, readPages } from "./snapshot-failure.mjs";
import { isObject, nonBlank, positiveInteger } from "./snapshot-values.mjs";

// The Project fields each item keeps, in the order the snapshot lists them.
const ITEM_FIELD_NAMES = ["Status", "Repository", "Parent issue", "Linked pull requests"];

function isSingleSelectStatus(status) {
  return status.data_type === "single_select" && Array.isArray(status.options) && nonBlank(status.node_id);
}

function namedField(fields, name, endpoint) {
  const matches = fields.filter((field) => isObject(field) && field.name === name);
  if (matches.length !== 1) {
    throw readFailure(endpoint, `must include exactly one "${name}" field, found ${matches.length}`);
  }
  if (!positiveInteger(matches[0].id)) {
    throw readFailure(endpoint, `the "${name}" field must carry a numeric id`);
  }
  return matches[0];
}

function doneOption(status, endpoint) {
  const done = status.options.filter((option) => readStatusName(option, "a Status option name", endpoint) === "Done");
  if (done.length !== 1 || !nonBlank(done[0].id)) {
    throw readFailure(endpoint, `must include exactly one Status option named Done, found ${done.length}`);
  }
  return done[0];
}

// A Status name read from one REST value. A value that is present but unreadable fails the build,
// naming what it was read from, so no caller can write over a value nobody could read.
export function readStatusName(value, subject, endpoint) {
  try {
    return statusValueName(value);
  } catch (error) {
    throw readFailure(endpoint, `${subject} is unreadable: ${messageOf(error)}`, error);
  }
}

// The Project fields the snapshot reads, each found by its name. A missing or repeated name fails the
// build, because a wrong field would silently change what the snapshot says about every item.
export function projectFields(read, basePath, number) {
  const endpoint = `${basePath}/projectsV2/${number}/fields?per_page=100`;
  const fields = readPages(read, endpoint);
  const status = namedField(fields, "Status", endpoint);
  if (!isSingleSelectStatus(status)) {
    throw readFailure(endpoint, 'the "Status" field must be single-select with options and a node_id');
  }
  const done = doneOption(status, endpoint);
  return {
    statusFieldId: status.node_id,
    doneOptionId: done.id,
    fieldIds: ITEM_FIELD_NAMES.map((name) => namedField(fields, name, endpoint).id),
  };
}
