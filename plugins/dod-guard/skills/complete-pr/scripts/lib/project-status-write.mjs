import { runGh } from "./gh-runner.mjs";
import { projectItemReads } from "./project-item-reads.mjs";
import { blockingSleep } from "./project-item-single-read.mjs";
import { applyStatusMutation, resolveProjectItemInputs } from "./project-status-apply.mjs";
import {
  buildProjectFieldsCommand,
  buildProjectItemEditCommand,
  buildProjectViewCommand,
} from "./project-status-commands.mjs";
import {
  parseArrayResponse,
  parseJson,
  resolveProjectNodeId,
  resolveStatusField,
  resolveStatusOption,
} from "./project-status-fields.mjs";
import { requireWriteRequest } from "./project-status-request.mjs";

function resolveStatusTarget({ commandRunner, owner, projectNumber, statusFieldId, statusOptionId, expectedStatus }) {
  const project = parseJson(commandRunner(buildProjectViewCommand(owner, projectNumber)), "Project view");
  const projectId = resolveProjectNodeId(project);
  const fieldsReply = commandRunner(buildProjectFieldsCommand(owner, projectNumber));
  const statusField = resolveStatusField(parseArrayResponse(fieldsReply, "Project fields"), statusFieldId);
  resolveStatusOption(statusField, statusOptionId, expectedStatus);
  return { projectId, restStatusFieldId: String(statusField.id) };
}

function writeItemStatus(context, itemId, { identity, status: initialStatus }) {
  const { expectedStatus, restStatusFieldId } = context;
  if (initialStatus === expectedStatus) {
    return { itemId, status: expectedStatus };
  }
  const { owner, projectNumber, statusOptionId } = context;
  const editCommand = buildProjectItemEditCommand({
    owner,
    projectNumber,
    itemId: identity.id,
    statusFieldId: restStatusFieldId,
    statusOptionId,
  });
  const status = applyStatusMutation({
    commandRunner: context.commandRunner,
    reads: context.reads,
    editCommand,
    itemId,
    identity,
    statusFieldId: restStatusFieldId,
    expectedStatus,
  });
  return { itemId, status };
}

function writeProjectStatuses({
  owner,
  projectNumber,
  statusFieldId,
  statusOptionId,
  expectedStatus,
  itemIds,
  commandRunner = runGh,
  sleep = blockingSleep,
}) {
  requireWriteRequest({ owner, projectNumber, statusFieldId, statusOptionId, expectedStatus, itemIds });
  const request = { owner, projectNumber, statusOptionId, expectedStatus, commandRunner };
  const { projectId, restStatusFieldId } = resolveStatusTarget({ ...request, statusFieldId });
  const reads = projectItemReads({
    owner,
    projectNumber,
    statusFieldId: restStatusFieldId,
    commandRunner,
    sleep,
    itemIds,
  });
  const resolved = resolveProjectItemInputs(itemIds, restStatusFieldId, reads.resolveTarget);
  const context = { ...request, restStatusFieldId, reads };
  const mutations = itemIds.map((itemId) => writeItemStatus(context, itemId, resolved.get(itemId)));
  return { projectId, mutations };
}

export { writeProjectStatuses };
