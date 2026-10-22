import { isLinkedProjectRead } from "../../../lib/linked-project-read.mjs";
import { ISSUE_NUMBERS, REPOSITORY, STATUS_OPTIONS } from "./fixtures/lifecycle-constants.mjs";
import { issueRoute, subIssuesRoute } from "./fixtures/lifecycle-issue-routes.mjs";
import {
  commandResult,
  createIssue,
  createProjectItem,
  formValues,
  isLiveAddItemShape,
  issueRecord,
  linkedProjectReply,
  PROJECT_ENDPOINT,
  PULL_ENDPOINT,
  projectItem,
  staticReply,
  unprocessable,
} from "./fixtures/lifecycle-replies.mjs";

const ISSUES_ENDPOINT = `repos/${REPOSITORY}/issues`;
const PROJECT_ITEMS_ENDPOINT = `${PROJECT_ENDPOINT}/items`;

function startsWithPrefix(endpoint, prefix) {
  return endpoint?.startsWith(prefix) === true;
}

function visibleProjectItems(state, options) {
  return [...state.projectItems.values()].filter((item) => item.issueNumber !== options.missingProjectItem);
}

function listIssues(state, { options }) {
  const visibleIssues = [...state.issues.values()].filter((issue) => issue.number !== options.unresolvedIssueCreate);
  return commandResult(visibleIssues.map((issue) => issueRecord(issue)));
}

const LIFECYCLE_MARKER = /<!-- dod-guard:lifecycle-fixture:(\d+) -->/;

function markedIssueNumber(state, body) {
  const markerMatch = body.match(LIFECYCLE_MARKER);
  if (!markerMatch) {
    throw new Error("Issue create requires the exact lifecycle marker.");
  }
  const number = Number(markerMatch[1]);
  if (!ISSUE_NUMBERS.includes(number)) {
    throw new Error(`Unknown lifecycle issue marker ${number}.`);
  }
  if (state.issues.has(number)) {
    throw new Error(`Lifecycle issue ${number} already exists.`);
  }
  return number;
}

function isAmbiguousCreate(options, number) {
  return options.ambiguousIssueCreate === number || options.unresolvedIssueCreate === number;
}

function createIssueRoute(state, { args, options }) {
  const number = markedIssueNumber(state, formValues(args, "body=")[0] ?? "");
  const title = formValues(args, "title=")[0] ?? `Disposable fixture ${number}`;
  const issue = createIssue(number, title);
  state.issues.set(number, issue);
  if (options.autoAddProjectItems) {
    state.projectItems.set(number, createProjectItem(issue));
  }
  if (isAmbiguousCreate(options, number)) {
    throw new Error(`Ambiguous issue create for ${number}.`);
  }
  return commandResult(issueRecord(issue));
}

function issuesPrefixRoute(state, request) {
  const suffix = request.endpoint.slice(`${ISSUES_ENDPOINT}/`.length);
  if (suffix.endsWith("/sub_issues")) {
    return subIssuesRoute(state, request, suffix);
  }
  return issueRoute(state, request, suffix);
}

function mergeRoute(state) {
  state.pull.merged = true;
  return commandResult({ merged: true, sha: "merge-1" });
}

function addProjectItemRoute(state, { args }) {
  if (!isLiveAddItemShape(args)) {
    return unprocessable("Validation Failed");
  }
  const issueId = Number(formValues(args, "id=")[0]);
  const issue = [...state.issues.values()].find((candidate) => candidate.id === issueId);
  if (!issue) throw new Error(`Unknown project item issue ${issueId}.`);
  if (state.projectItems.has(issue.number)) {
    return unprocessable("Content already exists in this project");
  }
  const item = createProjectItem(issue);
  state.projectItems.set(issue.number, item);
  return commandResult(projectItem(item));
}

function listProjectItemsPage(state, { options }) {
  const items = visibleProjectItems(state, options);
  return commandResult([items.map((item) => projectItem(item))]);
}

function listProjectItemsExact(state, { args, options }) {
  const items = visibleProjectItems(state, options);
  if (args.includes("--slurp")) {
    const slurped = items.map((item) => projectItem(item, options.contradictoryStatus));
    return commandResult([slurped]);
  }
  return {
    status: 0,
    stderr: "",
    stdout: items.map((item) => JSON.stringify(projectItem(item, options.contradictoryStatus))).join("\n"),
  };
}

function getProjectItem(state, { endpoint, options }) {
  const prefix = `${PROJECT_ITEMS_ENDPOINT}/`;
  const restItemId = endpoint.slice(prefix.length).split("?", 1)[0];
  const item = [...state.projectItems.values()].find((candidate) => String(candidate.id) === restItemId);
  if (!item) throw new Error(`Unknown project item readback ${restItemId}.`);
  return commandResult(projectItem(item, options.contradictoryStatus));
}

function patchProjectItem(state, { args, endpoint, options }) {
  const restItemId = endpoint.slice(`${PROJECT_ITEMS_ENDPOINT}/`.length);
  const item = [...state.projectItems.values()].find((candidate) => String(candidate.id) === restItemId);
  const optionId = formValues(args, "fields[][value]=")[0];
  const option = STATUS_OPTIONS.find((candidate) => candidate.id === optionId);
  if (!(item && option)) {
    throw new Error(`Unknown project status mutation ${restItemId}.`);
  }
  item.status = option.name;
  state.transitions.push({ itemId: item.nodeId, status: item.status });
  if (options.ambiguousStatusWrite === option.name) {
    throw new Error(`Ambiguous status write for ${item.nodeId}.`);
  }
  return commandResult(projectItem(item));
}

// First match wins. The order is load-bearing: the page or fields prefix must
// answer before the exact items list, and the GET and PATCH item routes share
// one prefix and split only on method.
const ROUTES = [
  {
    matches: ({ endpoint, method }) => endpoint === `${ISSUES_ENDPOINT}?state=all&per_page=100` && method === "GET",
    handle: listIssues,
  },
  {
    matches: ({ endpoint, method }) => endpoint === ISSUES_ENDPOINT && method === "POST",
    handle: createIssueRoute,
  },
  {
    matches: ({ endpoint }) => startsWithPrefix(endpoint, `${ISSUES_ENDPOINT}/`),
    handle: issuesPrefixRoute,
  },
  {
    matches: ({ endpoint, method }) => endpoint === `${PULL_ENDPOINT}/merge` && method === "PUT",
    handle: mergeRoute,
  },
  {
    matches: ({ endpoint, method }) => endpoint === PROJECT_ITEMS_ENDPOINT && method === "POST",
    handle: addProjectItemRoute,
  },
  {
    matches: ({ endpoint }) =>
      startsWithPrefix(endpoint, `${PROJECT_ITEMS_ENDPOINT}?per_page=100&page=`) ||
      startsWithPrefix(endpoint, `${PROJECT_ITEMS_ENDPOINT}?per_page=100&fields=`),
    handle: listProjectItemsPage,
  },
  {
    matches: ({ endpoint }) => endpoint === `${PROJECT_ITEMS_ENDPOINT}?per_page=100`,
    handle: listProjectItemsExact,
  },
  {
    matches: ({ endpoint, method }) => startsWithPrefix(endpoint, `${PROJECT_ITEMS_ENDPOINT}/`) && method === "GET",
    handle: getProjectItem,
  },
  {
    matches: ({ endpoint, method }) => startsWithPrefix(endpoint, `${PROJECT_ITEMS_ENDPOINT}/`) && method === "PATCH",
    handle: patchProjectItem,
  },
];

export function createRecordingTransport({
  missingProjectItem,
  contradictoryStatus = false,
  autoAddProjectItems = false,
  ambiguousStatusWrite,
  existingIssueNumbers = [],
  ambiguousIssueCreate,
  unresolvedIssueCreate,
} = {}) {
  const calls = [];
  const state = {
    issues: new Map(),
    projectItems: new Map(),
    transitions: [],
    pull: { merged: false },
  };
  const options = {
    missingProjectItem,
    contradictoryStatus,
    autoAddProjectItems,
    ambiguousStatusWrite,
    ambiguousIssueCreate,
    unresolvedIssueCreate,
  };

  for (const number of existingIssueNumbers) {
    state.issues.set(number, createIssue(number));
  }

  function run(args) {
    calls.push([...args]);
    // The documented linked-Project read is the one GraphQL a lifecycle makes.
    if (isLinkedProjectRead(args)) {
      return commandResult(linkedProjectReply());
    }
    if (args.some((value) => /graphql/i.test(String(value)))) {
      throw new Error("Forbidden routine GraphQL request.");
    }
    const endpoint = args.find(
      (value) => typeof value === "string" && (value.startsWith("repos/") || value.startsWith("users/")),
    );
    const methodIndex = args.indexOf("--method");
    const method = methodIndex === -1 ? "GET" : args[methodIndex + 1];
    const request = { args, endpoint, method, options };

    const reply = staticReply(endpoint, state);
    if (reply !== undefined) return reply;
    const route = ROUTES.find((candidate) => candidate.matches(request));
    if (route) return route.handle(state, request);
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  }

  return {
    calls,
    commandRunner: run,
    projectItems: state.projectItems,
    transitions: state.transitions,
  };
}
