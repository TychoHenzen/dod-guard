import assert from "node:assert/strict";
import { endpointOf } from "./fixtures/project-status-calls.mjs";
import {
  ITEM_IDS,
  ITEM_LIST_PREFIX,
  ITEM_NUMERIC_IDS,
  ITEM_READ_PREFIX,
  PROJECT_ID,
  projectFields,
  projectItems,
  singleItemReply,
} from "./fixtures/project-status-data.mjs";

const PROJECT_ENDPOINT = "users/TychoHenzen/projectsV2/2";
const FIELDS_ENDPOINT = "users/TychoHenzen/projectsV2/2/fields?per_page=100";

function jsonReply(body) {
  return { status: 0, stderr: "", stdout: JSON.stringify(body) };
}

function backlogStatuses() {
  return new Map(ITEM_IDS.map((itemId) => [itemId, "Backlog"]));
}

function listPages(statuses, splitItems) {
  const items = projectItems(statuses);
  return splitItems ? [items.slice(0, 1), items.slice(1)] : [items];
}

function patchedItemNodeId(endpoint) {
  const entries = [...ITEM_NUMERIC_IDS.entries()];
  return entries.find(([, numericId]) => endpoint.endsWith(String(numericId)))?.[0];
}

function patchedStatusName(args) {
  const optionArg = args.find((value) => String(value).startsWith("fields[][value]="));
  const optionId = optionArg?.split("=", 2)[1];
  return projectFields()[0].options.find((option) => option.id === optionId)?.name.raw;
}

function isItemEndpoint({ endpoint }) {
  return endpoint?.startsWith(ITEM_READ_PREFIX) === true;
}

const ROUTES = [
  [({ endpoint }) => endpoint === PROJECT_ENDPOINT, ({ state }) => jsonReply({ node_id: state.projectId })],
  [({ endpoint }) => endpoint === FIELDS_ENDPOINT, ({ state }) => jsonReply([state.fields])],
  [
    ({ endpoint }) => endpoint?.startsWith(ITEM_LIST_PREFIX) === true,
    ({ state }) => jsonReply(listPages(state.statuses, state.splitItems)),
  ],
  [
    (request) => isItemEndpoint(request) && request.args.includes("PATCH"),
    ({ state, args, endpoint }) => {
      state.statuses.set(patchedItemNodeId(endpoint), patchedStatusName(args));
      return { status: 0, stderr: "", stdout: "" };
    },
  ],
  [isItemEndpoint, ({ state, endpoint }) => singleItemReply(state.statuses, endpoint)],
];

export function createRunner(options = {}) {
  const {
    projectId = PROJECT_ID,
    statuses = backlogStatuses(),
    splitItems = false,
    fields = projectFields(),
  } = options;
  const state = { projectId, statuses, splitItems, fields };
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    assert.equal(args[0], "api");
    const request = { state, args, endpoint: endpointOf(args) };
    const route = ROUTES.find(([matches]) => matches(request));
    if (route === undefined) {
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    }
    return route[1](request);
  };
  return { calls, runner };
}
