const NUMERIC_ITEM_ID = /^\d+$/;

function isPresent(value) {
  return value !== undefined && value !== null;
}

function isBlankId(value) {
  return !isPresent(value) || String(value).trim().length === 0;
}

function nodeIdOf(item) {
  return item?.node_id ?? item?.nodeId;
}

function projectItemIdentity(item) {
  const id = item?.id;
  const nodeId = nodeIdOf(item);
  if (isBlankId(id) || isBlankId(nodeId)) {
    throw new Error("Project item readback must include stable numeric and global IDs.");
  }
  return { id: String(id), nodeId: String(nodeId) };
}

function idText(value) {
  return String(value ?? "");
}

function hasNodeOrRestId(entry, id) {
  return idText(entry?.node_id) === id || idText(entry?.id) === id;
}

function isNumericItemId(itemId) {
  return NUMERIC_ITEM_ID.test(itemId);
}

function findProjectItem(items, itemId) {
  const matches = items.filter((item) => hasNodeOrRestId(item, itemId));
  if (matches.length !== 1) {
    return null;
  }
  return matches[0];
}

function matchesIdentity(candidate, identity) {
  const { id, nodeId } = projectItemIdentity(candidate);
  return id === identity.id || nodeId === identity.nodeId;
}

function preservesIdentity(readback, identity) {
  return readback.id === identity.id && readback.nodeId === identity.nodeId;
}

// Matching on the resolved pair, not the caller's spelling, reports a change to either ID alone as an
// identity change; when both IDs change nothing matches, so the readback stops as a missing item.
function findReadbackProjectItem(items, itemId, identity) {
  const matches = items.filter((candidate) => matchesIdentity(candidate, identity));
  if (matches.length === 0) {
    throw new Error(`Project item ${itemId} was missing from readback.`);
  }
  const [item] = matches;
  const readback = projectItemIdentity(item);
  if (matches.length !== 1 || !preservesIdentity(readback, identity)) {
    throw new Error(`Project item ${itemId} readback must preserve the same numeric and global IDs.`);
  }
  return item;
}

export { findProjectItem, findReadbackProjectItem, hasNodeOrRestId, isNumericItemId, isPresent, projectItemIdentity };
