import assert from "node:assert/strict";
import { readIssueProjectStatuses } from "../project-reads.mjs";
import {
  linkedProjectItem,
  PROJECT_STATUS_FIELD_ID,
  projectItemIdentity,
  projectStatusResponse,
} from "./project-status-items.mjs";

const jsonReply = (stdout) => ({ status: 0, stderr: "", stdout });
const isUsersEndpoint = (value) =>
  typeof value === "string" && value.startsWith("users/");

function defaultConfig() {
  return {
    projects: [{ number: 2, state: "open" }],
    itemsByProject: new Map([["2", [linkedProjectItem(1701)]]]),
    fieldsByProject: new Map([
      ["2", [{ id: PROJECT_STATUS_FIELD_ID, name: "Status" }]],
    ]),
    itemResponses: new Map([["2/1701", projectStatusResponse("Done")]]),
    itemPagesByProject: new Map(),
    rateLimitedProjects: new Set(),
  };
}

function fieldsReply(config, match) {
  const fields = config.fieldsByProject.get(match[1]) ?? [];
  return jsonReply(JSON.stringify([fields]));
}

const RATE_LIMITED = {
  status: 1,
  stderr: "HTTP 403: API rate limit exceeded",
  stdout: "",
};

function listedPages(config, project) {
  const paged = config.itemPagesByProject.get(project);
  return paged ?? [config.itemsByProject.get(project) ?? []];
}

function itemListReply(config, match) {
  if (config.rateLimitedProjects.has(match[1])) {
    return RATE_LIMITED;
  }
  const lines = listedPages(config, match[1])
    .flat()
    .map((item) => JSON.stringify(projectItemIdentity(item)));
  return jsonReply(lines.join("\n"));
}

function itemReply(config, match) {
  const response = config.itemResponses.get(`${match[1]}/${match[2]}`);
  if (!response) {
    throw new Error(`Unexpected item endpoint: ${match.input}`);
  }
  return jsonReply(JSON.stringify(response));
}

const HANDLERS = [
  [
    /^users\/owner\/projectsV2\?per_page=100$/,
    (config) => jsonReply(JSON.stringify([config.projects])),
  ],
  [/^users\/owner\/projectsV2\/(\d+)\/fields\?/, fieldsReply],
  [/^users\/owner\/projectsV2\/(\d+)\/items\?/, itemListReply],
  [/^users\/owner\/projectsV2\/(\d+)\/items\/(\d+)\?/, itemReply],
];

function answer(config, args) {
  assert.equal(args[0], "api");
  const endpoint = args.find(isUsersEndpoint) ?? "";
  for (const [pattern, handle] of HANDLERS) {
    const match = endpoint.match(pattern);
    if (match) {
      return handle(config, match);
    }
  }
  throw new Error(`Unexpected command: ${args.join(" ")}`);
}

export function createProjectStatusReader(options = {}) {
  const config = { ...defaultConfig(), ...options };
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return answer(config, args);
  };
  const read = (issueNumber = 24) =>
    readIssueProjectStatuses("owner/repo", issueNumber, runner);
  return { calls, read };
}

export function statusReaderWithFields(fields) {
  return createProjectStatusReader({
    itemResponses: new Map([
      ["2/1701", { ...linkedProjectItem(1701), fields }],
    ]),
  }).read;
}
