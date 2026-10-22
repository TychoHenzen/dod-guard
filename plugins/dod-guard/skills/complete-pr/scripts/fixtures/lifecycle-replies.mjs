import {
  HEAD_SHA,
  ISSUE_NUMBERS,
  ITEM_NODE_BY_ISSUE,
  ITEM_NUMERIC_IDS,
  OWNER,
  PARENT_NUMBER,
  PROJECT_NODE_ID,
  PROJECT_NUMBER,
  PULL_NUMBER,
  REPOSITORY,
  STATUS_FIELD_ID,
  STATUS_FIELD_NODE_ID,
  STATUS_OPTIONS,
  issueMarker,
} from "./lifecycle-constants.mjs";

export function commandResult(data, status = 0, stderr = "") {
  return { status, stderr, stdout: JSON.stringify(data) };
}

export function exactHeadCheckRun(id, name) {
  return {
    id,
    app: { id: 15_368 },
    conclusion: "success",
    head_sha: HEAD_SHA,
    name,
    status: "completed",
  };
}

export function formValues(args, prefix) {
  return args
    .filter((value) => typeof value === "string" && value.startsWith(prefix))
    .map((value) => value.slice(prefix.length));
}

// The answer gh gives for a REST 422: the body on stdout and exit 1.
export function unprocessable(message) {
  const stderr = `gh: ${message} (HTTP 422)`;
  return commandResult({ message, status: "422" }, 1, stderr);
}

// The live API rejected the content_id/content_type shape with a 422, so the
// fixture accepts only type with an id.
export function isLiveAddItemShape(args) {
  const [type] = formValues(args, "type=");
  const legacy = formValues(args, "content_").length > 0;
  return !legacy && ["Issue", "PullRequest"].includes(type);
}

// The repository's one open explicit link, as the linked-Project read returns
// it.
export function linkedProjectReply() {
  const project = {
    id: PROJECT_NODE_ID,
    number: PROJECT_NUMBER,
    title: "Disposable lifecycle Project",
    closed: false,
    owner: { __typename: "User", login: OWNER },
  };
  const projectsV2 = { nodes: [project], pageInfo: { hasNextPage: false } };
  return { data: { repository: { projectsV2 } } };
}

export function createIssue(number, title = `Disposable fixture ${number}`) {
  return {
    id: 900_000 + number,
    number,
    title,
    body: `Captured for REST lifecycle proof.\n\n${issueMarker(number)}`,
    state: "open",
    labels: [],
    parent: null,
    children: [],
  };
}

export function issueRecord(issue) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels.map((name) => ({ name })),
    repository: { full_name: REPOSITORY },
    parent_issue: issue.parent === null ? null : { number: issue.parent },
    html_url: `https://github.com/${REPOSITORY}/issues/${issue.number}`,
  };
}

function itemStatus(item, includeContradiction) {
  const option = STATUS_OPTIONS.find(
    (candidate) => candidate.name === item.status,
  );
  const name =
    includeContradiction && item.issueNumber === PARENT_NUMBER
      ? { raw: item.status, html: item.status === "Done" ? "Todo" : "Done" }
      : { raw: item.status };
  return {
    id: STATUS_FIELD_ID,
    name: "Status",
    data_type: "single_select",
    value: { id: option.id, name },
  };
}

export function projectItem(item, includeContradiction = false) {
  return {
    id: item.id,
    node_id: item.nodeId,
    content: {
      number: item.issueNumber,
      repository: { full_name: REPOSITORY },
      repository_url: `https://api.github.com/repos/${REPOSITORY}`,
    },
    fields: [itemStatus(item, includeContradiction)],
  };
}

export function createProjectItem(issue) {
  const nodeId = ITEM_NODE_BY_ISSUE.get(issue.number);
  return {
    id: ITEM_NUMERIC_IDS.get(nodeId),
    nodeId,
    issueNumber: issue.number,
    status: "Backlog",
  };
}

export const PULL_ENDPOINT = `repos/${REPOSITORY}/pulls/${PULL_NUMBER}`;
export const PROJECT_ENDPOINT = `users/${OWNER}/projectsV2/${PROJECT_NUMBER}`;

const STATIC_REPLIES = new Map([
  [
    `repos/${REPOSITORY}`,
    () =>
      commandResult({
        full_name: REPOSITORY,
        default_branch: "master",
        allow_auto_merge: true,
        permissions: { push: true },
      }),
  ],
  [
    `repos/${REPOSITORY}/branches/master/protection/required_status_checks`,
    () =>
      commandResult({
        checks: [
          { app_id: 15_368, context: "build-test" },
          { app_id: 15_368, context: "static-analysis" },
        ],
      }),
  ],
  // build-test ran twice on the head, as a pull_request run and a later
  // workflow_dispatch run.
  [
    `repos/${REPOSITORY}/commits/${HEAD_SHA}/check-runs?per_page=100`,
    () =>
      commandResult({
        check_runs: [
          exactHeadCheckRun(101, "build-test"),
          exactHeadCheckRun(102, "static-analysis"),
          exactHeadCheckRun(103, "build-test"),
        ],
      }),
  ],
  [
    `repos/${REPOSITORY}/commits/${HEAD_SHA}/status?per_page=100`,
    () => commandResult({ sha: HEAD_SHA, statuses: [] }),
  ],
  [
    PULL_ENDPOINT,
    (state) =>
      commandResult({
        number: PULL_NUMBER,
        state: state.pull.merged ? "closed" : "open",
        draft: false,
        merged_at: state.pull.merged ? "2026-09-28T00:00:00Z" : null,
        merge_commit_sha: state.pull.merged ? "merge-1" : null,
        body: ISSUE_NUMBERS.map((number) => `Closes #${number}`).join("\n"),
        base: { ref: "master", sha: "base-1" },
        head: {
          ref: "codex/disposable",
          sha: HEAD_SHA,
          repo: { full_name: REPOSITORY },
        },
        mergeable_state: "clean",
        mergeable: true,
        html_url: `https://github.com/${REPOSITORY}/pull/${PULL_NUMBER}`,
      }),
  ],
  [`${PULL_ENDPOINT}/commits?per_page=100`, () => commandResult([[]])],
  [
    `${PULL_ENDPOINT}/reviews`,
    () => commandResult([{ state: "APPROVED", commit_id: HEAD_SHA }]),
  ],
  [
    `users/${OWNER}/projectsV2?per_page=100`,
    () => commandResult([[{ number: PROJECT_NUMBER, state: "open" }]]),
  ],
  [
    PROJECT_ENDPOINT,
    () =>
      commandResult({
        id: String(PROJECT_NUMBER),
        number: PROJECT_NUMBER,
        node_id: PROJECT_NODE_ID,
      }),
  ],
  [
    `${PROJECT_ENDPOINT}/fields?per_page=100`,
    () =>
      commandResult([
        [
          {
            id: STATUS_FIELD_ID,
            node_id: STATUS_FIELD_NODE_ID,
            name: "Status",
            data_type: "single_select",
            options: STATUS_OPTIONS.map(({ id, name }) => ({
              id,
              name: { raw: name },
            })),
          },
        ],
      ]),
  ],
]);

// Returns undefined when the endpoint is not a fixed reply.
export function staticReply(endpoint, state) {
  const reply = STATIC_REPLIES.get(endpoint);
  return reply === undefined ? undefined : reply(state);
}
