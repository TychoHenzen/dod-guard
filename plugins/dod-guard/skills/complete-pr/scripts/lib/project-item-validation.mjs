import { isPresent, projectItemIdentity } from "./project-item-identity.mjs";

function repositoryNameOf(item) {
  const repository = item?.content?.repository ?? {};
  return repository.full_name ?? repository.fullName;
}

function membershipKey(item) {
  const repository = repositoryNameOf(item);
  const number = item?.content?.number;
  if (repository && isPresent(number)) {
    return `${repository.toLowerCase()}#${number}`;
  }
  return null;
}

function rejectRepeatedIdentity({ id, nodeId }, seen) {
  if (seen.ids.has(id) || seen.nodeIds.has(nodeId)) {
    throw new Error(`Project item ${nodeId} appeared more than once in readback.`);
  }
  seen.ids.add(id);
  seen.nodeIds.add(nodeId);
}

function rejectRepeatedMembership(membership, seen) {
  if (membership === null) {
    return;
  }
  if (seen.has(membership)) {
    throw new Error(`Project membership ${membership} appeared more than once in readback.`);
  }
  seen.add(membership);
}

function validateProjectItems(items) {
  const seen = { ids: new Set(), nodeIds: new Set(), memberships: new Set() };
  for (const item of items) {
    rejectRepeatedIdentity(projectItemIdentity(item), seen);
    rejectRepeatedMembership(membershipKey(item), seen.memberships);
  }
  return items;
}

export { validateProjectItems };
