export const REPOSITORY = "owner/repo";
export const OWNER = "owner";
export const PROJECT_NUMBER = 2;
export const PROJECT_NODE_ID = "PVT_disposable";
export const STATUS_FIELD_NODE_ID = "PVTSSF_status";
export const STATUS_FIELD_ID = 407767889;
export const PULL_NUMBER = 670;
export const HEAD_SHA = "head-1";
export const PARENT_NUMBER = 660;
export const CHILD_NUMBERS = [665, 666, 667, 668];
export const ISSUE_NUMBERS = [PARENT_NUMBER, ...CHILD_NUMBERS];
export const ITEM_NODE_IDS = [
  "PVTI_child-665",
  "PVTI_child-666",
  "PVTI_child-667",
  "PVTI_child-668",
  "PVTI_parent",
];
export const ITEM_NUMERIC_IDS = new Map(ITEM_NODE_IDS.map((itemId, index) => [itemId, 256202820 + index]));
export const ITEM_NODE_BY_ISSUE = new Map([
  [665, ITEM_NODE_IDS[0]],
  [666, ITEM_NODE_IDS[1]],
  [667, ITEM_NODE_IDS[2]],
  [668, ITEM_NODE_IDS[3]],
  [660, ITEM_NODE_IDS[4]],
]);
export const STATUS_OPTIONS = [
  { id: "30a230f4", name: "Backlog" },
  { id: "f75ad846", name: "Todo" },
  { id: "47fc9ee4", name: "In Progress" },
  { id: "98236657", name: "Done" },
];
export const ISSUE_LABELS = new Map([
  [660, ["bug", "Prio 1 - Emergency", "Effort 8 - Huge"]],
  [665, ["bug", "Prio 1 - Emergency", "Effort 5 - Large"]],
  [666, ["enhancement", "Prio 1 - Emergency", "Effort 5 - Large"]],
  [667, ["enhancement", "Prio 1 - Emergency", "Effort 5 - Large"]],
  [668, ["bug", "Prio 1 - Emergency", "Effort 3 - Medium"]],
]);

function commandResult(data, status = 0, stderr = "") {
  return { status, stderr, stdout: data === undefined ? "" : JSON.stringify(data) };
}

function formValues(args, prefix) {
  return args.filter((value) => typeof value === "string" && value.startsWith(prefix)).map((value) => value.slice(prefix.length));
}

export function createRecordingTransport({ missingProjectItem, contradictoryStatus = false } = {}) {
  const calls = [];
  const issues = new Map();
  const projectItems = new Map();
  const transitions = [];
  const pull = { merged: false };
  let captureIndex = 0;

  function issueRecord(number) {
    const issue = issues.get(number);
    return {
      id: issue.id,
      number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels.map((name) => ({ name })),
      repository: { full_name: REPOSITORY },
      parent_issue: issue.parent === null ? null : { number: issue.parent },
      html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
    };
  }

  function itemStatus(item, includeContradiction) {
    const option = STATUS_OPTIONS.find((candidate) => candidate.name === item.status);
    const name = includeContradiction && item.issueNumber === PARENT_NUMBER
      ? { raw: item.status, html: item.status === "Done" ? "Todo" : "Done" }
      : { raw: item.status };
    return { id: STATUS_FIELD_ID, name: "Status", data_type: "single_select", value: { id: option.id, name } };
  }

  function projectItem(item, includeContradiction = false) {
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

  function visibleProjectItems() {
    return [...projectItems.values()].filter((item) => item.issueNumber !== missingProjectItem);
  }

  function run(args) {
    calls.push([...args]);
    if (args.some((value) => /graphql/i.test(String(value)))) {
      throw new Error("Forbidden routine GraphQL request.");
    }
    if (args[0] === "pr" && args[1] === "checks") {
      return commandResult([
        { bucket: "pass", name: "build-test", state: "SUCCESS" },
        { bucket: "pass", name: "static-analysis", state: "SUCCESS" },
      ]);
    }

    const endpoint = args.find((value) =>
      typeof value === "string" && (value.startsWith("repos/") || value.startsWith("users/")));
    const methodIndex = args.indexOf("--method");
    const method = methodIndex === -1 ? "GET" : args[methodIndex + 1];
    const issuesEndpoint = `repos/${REPOSITORY}/issues`;
    const pullEndpoint = `repos/${REPOSITORY}/pulls/${PULL_NUMBER}`;
    const projectEndpoint = `users/${OWNER}/projectsV2/${PROJECT_NUMBER}`;
    const projectItemsEndpoint = `${projectEndpoint}/items`;

    if (endpoint === `repos/${REPOSITORY}`) {
      return commandResult({ full_name: REPOSITORY, default_branch: "master", allow_auto_merge: true, permissions: { push: true } });
    }
    if (endpoint === issuesEndpoint && method === "POST") {
      const number = ISSUE_NUMBERS[captureIndex++];
      const issue = {
        id: 900000 + number,
        number,
        title: `Disposable fixture ${number}`,
        body: "Captured for REST lifecycle proof.",
        state: "open",
        labels: [],
        parent: null,
        children: [],
      };
      issues.set(number, issue);
      return commandResult(issueRecord(number));
    }
    if (endpoint?.startsWith(`${issuesEndpoint}/`) === true) {
      const suffix = endpoint.slice(`${issuesEndpoint}/`.length);
      if (suffix.endsWith("/sub_issues")) {
        const parentNumber = Number(suffix.slice(0, -"/sub_issues".length));
        if (method === "POST") {
          const childId = Number(formValues(args, "sub_issue_id=")[0]);
          const child = [...issues.values()].find((issue) => issue.id === childId);
          if (!child) throw new Error(`Unknown child issue ${childId}.`);
          child.parent = parentNumber;
          issues.get(parentNumber).children.push(child.number);
        }
        return commandResult(issues.get(parentNumber).children.map((number) => issueRecord(number)));
      }
      const issueNumber = Number(suffix);
      const issue = issues.get(issueNumber);
      if (!issue) throw new Error(`Unknown issue ${issueNumber}.`);
      if (method === "PATCH") {
        const labels = formValues(args, "labels[]=");
        if (labels.length > 0) issue.labels = labels;
        const state = formValues(args, "state=")[0];
        if (state) issue.state = state;
      }
      return commandResult(issueRecord(issueNumber));
    }
    if (endpoint === pullEndpoint) {
      return commandResult({
        number: PULL_NUMBER,
        state: pull.merged ? "closed" : "open",
        draft: false,
        merged_at: pull.merged ? "2026-09-28T00:00:00Z" : null,
        merge_commit_sha: pull.merged ? "merge-1" : null,
        body: ISSUE_NUMBERS.map((number) => `Closes #${number}`).join("\n"),
        base: { ref: "master", sha: "base-1" },
        head: { ref: "codex/disposable", sha: HEAD_SHA, repo: { full_name: REPOSITORY } },
        mergeable_state: "clean",
        mergeable: true,
        html_url: `https://github.com/${REPOSITORY}/pull/${PULL_NUMBER}`,
      });
    }
    if (endpoint === `${pullEndpoint}/merge` && method === "PUT") {
      pull.merged = true;
      return commandResult({ merged: true, sha: "merge-1" });
    }
    if (endpoint === `${pullEndpoint}/commits?per_page=100`) return commandResult([[]]);
    if (endpoint === `${pullEndpoint}/reviews`) return commandResult([{ state: "APPROVED", commit_id: HEAD_SHA }]);
    if (endpoint === `users/${OWNER}/projectsV2?per_page=100`) {
      return commandResult([[{ number: PROJECT_NUMBER, state: "open" }]]);
    }
    if (endpoint === projectEndpoint) {
      return commandResult({ id: String(PROJECT_NUMBER), number: PROJECT_NUMBER, node_id: PROJECT_NODE_ID });
    }
    if (endpoint === `${projectEndpoint}/fields?per_page=100`) {
      return commandResult([[
        {
          id: STATUS_FIELD_ID,
          node_id: STATUS_FIELD_NODE_ID,
          name: "Status",
          data_type: "single_select",
          options: STATUS_OPTIONS.map(({ id, name }) => ({ id, name: { raw: name } })),
        },
      ]]);
    }
    if (endpoint === projectItemsEndpoint && method === "POST") {
      const issueId = Number(formValues(args, "content_id=")[0]);
      const issue = [...issues.values()].find((candidate) => candidate.id === issueId);
      if (!issue) throw new Error(`Unknown project item issue ${issueId}.`);
      const nodeId = ITEM_NODE_BY_ISSUE.get(issue.number);
      const item = { id: ITEM_NUMERIC_IDS.get(nodeId), nodeId, issueNumber: issue.number, status: "Backlog" };
      projectItems.set(issue.number, item);
      return commandResult(projectItem(item));
    }
    if (endpoint?.startsWith(`${projectItemsEndpoint}?per_page=100&page=`) === true) {
      return commandResult([visibleProjectItems().map((item) => projectItem(item))]);
    }
    if (endpoint === `${projectItemsEndpoint}?per_page=100`) {
      return {
        status: 0,
        stderr: "",
        stdout: visibleProjectItems().map((item) => JSON.stringify(projectItem(item, contradictoryStatus))).join("\n"),
      };
    }
    if (endpoint?.startsWith(`${projectItemsEndpoint}/`) === true && method === "GET") {
      const restItemId = endpoint.slice(`${projectItemsEndpoint}/`.length).split("?", 1)[0];
      const item = [...projectItems.values()].find((candidate) => String(candidate.id) === restItemId);
      if (!item) throw new Error(`Unknown project item readback ${restItemId}.`);
      return commandResult({ fields: [itemStatus(item, contradictoryStatus)] });
    }
    if (endpoint?.startsWith(`${projectItemsEndpoint}/`) === true && method === "PATCH") {
      const restItemId = endpoint.slice(`${projectItemsEndpoint}/`.length);
      const item = [...projectItems.values()].find((candidate) => String(candidate.id) === restItemId);
      const option = STATUS_OPTIONS.find((candidate) => candidate.id === formValues(args, "fields[][value]=")[0]);
      if (!item || !option) throw new Error(`Unknown project status mutation ${restItemId}.`);
      item.status = option.name;
      transitions.push({ itemId: item.nodeId, status: item.status });
      return commandResult(projectItem(item));
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  }

  return { calls, commandRunner: run, projectItems, transitions };
}
