// GitHub object shapes for the closure snapshot tests: the REST replies
// the builder reads (Project items, fields, issues, pull requests, check
// runs, statuses) and the constants those replies name. The route tables
// in the support module and the test files import them from here.
const OWNER = "TychoHenzen";
const REPO = `${OWNER}/dod-guard`;
const FOREIGN = `${OWNER}/DeepSeekCustom`;
const REPO_URL = `https://api.github.com/repos/${REPO}`;
const MERGED_AT = "2026-10-08T17:13:52Z";
const BASE_SHA = "c0".repeat(20);

function ok(value) {
  return { status: 0, stdout: JSON.stringify(value), stderr: "" };
}

function failed(stderr) {
  return { status: 1, stdout: "", stderr };
}

function issueUrl(url, parent) {
  if (parent === null) {
    return null;
  }
  return `${url}/issues/${parent}`;
}

function subIssuesSummary(total) {
  return { total, completed: 0, percent_completed: 0 };
}

function dependenciesSummary(blockedBy) {
  return { blocked_by: blockedBy, total_blocked_by: blockedBy, blocking: 0, total_blocking: 0 };
}

// parentRepo names the repository of the parent issue, which may differ
// from the issue's own repository.
function issueContent(
  number,
  {
    repo = REPO,
    parentRepo = repo,
    state = "open",
    stateReason = null,
    body = "",
    parent = null,
    subIssues = 0,
    blockedBy = 0,
    comments = 0,
  } = {},
) {
  const url = `https://api.github.com/repos/${repo}`;
  const parentUrl = `https://api.github.com/repos/${parentRepo}`;
  return {
    number,
    title: `Issue ${number}`,
    state,
    state_reason: stateReason,
    body,
    repository: { full_name: repo },
    repository_url: url,
    parent_issue_url: issueUrl(parentUrl, parent),
    sub_issues_summary: subIssuesSummary(subIssues),
    issue_dependencies_summary: dependenciesSummary(blockedBy),
    comments,
  };
}

function parentFieldValue(parent, repo = REPO) {
  if (parent === null) {
    return null;
  }
  const url = `https://api.github.com/repos/${repo}`;
  return {
    repository_url: url,
    url: `${url}/issues/${parent}`,
    number: parent,
  };
}

function statusValue(status) {
  return {
    id: `opt-${status.toLowerCase()}`,
    name: { raw: status, html: status },
  };
}

function itemFields(
  content,
  { status = "Backlog", parent = null, parentRepo = REPO, linked = [] },
) {
  return [
    { id: 900, name: "Title", value: content.title },
    { id: 101, name: "Status", value: statusValue(status) },
    {
      id: 102,
      name: "Repository",
      value: { full_name: content.repository.full_name },
    },
    {
      id: 103,
      name: "Parent issue",
      value: parentFieldValue(parent, parentRepo),
    },
    { id: 104, name: "Linked pull requests", value: linked },
  ];
}

// A Project item as the --slurp items read returns it. The Status value
// uses the REST spelling {id, name: {raw, html}}. The Title field is not
// one the snapshot keeps, so it proves the shaping ignores fields it was
// not asked for.
function projectItem({ nodeId, databaseId, content, ...options }) {
  return {
    id: databaseId,
    node_id: nodeId,
    content_type: "Issue",
    content,
    fields: itemFields(content, options),
  };
}

function landing(merged, mergeCommit) {
  if (!merged) {
    return { merged_at: null, merge_commit_sha: null };
  }
  return { merged_at: MERGED_AT, merge_commit_sha: mergeCommit };
}

// A full REST pull request object, as a Linked pull requests value carries
// it.
function pull(
  number,
  {
    repo = REPO,
    state = "closed",
    sha,
    merged = true,
    mergeCommit = null,
  } = {},
) {
  return {
    number,
    url: `https://api.github.com/repos/${repo}/pulls/${number}`,
    state,
    ...landing(merged, mergeCommit),
    head: { ref: `codex/${number}`, sha, repo: { full_name: repo } },
    base: { ref: "master", sha: BASE_SHA, repo: { full_name: repo } },
  };
}

// The Status options spell their names both ways: Backlog and Done as
// {raw, html}, Todo as a bare string.
const PROJECT_FIELDS = {
  status: {
    id: 101,
    node_id: "PVTSSF_status",
    name: "Status",
    data_type: "single_select",
    options: [
      { id: "opt-backlog", name: { raw: "Backlog", html: "Backlog" } },
      { id: "opt-todo", name: "Todo" },
      { id: "opt-done", name: { raw: "Done", html: "Done" } },
    ],
  },
  repository: {
    id: 102,
    node_id: "PVTF_repository",
    name: "Repository",
    data_type: "repository",
  },
  parent: {
    id: 103,
    node_id: "PVTF_parent",
    name: "Parent issue",
    data_type: "parent_issue",
  },
  linked: {
    id: 104,
    node_id: "PVTF_linked",
    name: "Linked pull requests",
    data_type: "pull_request",
  },
  title: { id: 900, node_id: "PVTF_title", name: "Title", data_type: "title" },
};

// The fields list is split across two pages, as a long Project's list is.
function fieldPages({ withParent = true } = {}) {
  const { status, repository, parent, linked, title } =
    structuredClone(PROJECT_FIELDS);
  return [
    [status, repository],
    withParent ? [parent, linked, title] : [linked, title],
  ];
}

function checkRunsReply(sha) {
  return ok([
    {
      total_count: 1,
      check_runs: [
        {
          name: "build-test",
          head_sha: sha,
          status: "completed",
          conclusion: "success",
        },
      ],
    },
  ]);
}

function commitStatusReply(sha) {
  return ok([
    {
      sha,
      state: "success",
      statuses: [{ context: "lint", state: "success", sha }],
    },
  ]);
}

export {
  BASE_SHA,
  checkRunsReply,
  commitStatusReply,
  failed,
  FOREIGN,
  fieldPages,
  issueContent,
  MERGED_AT,
  OWNER,
  ok,
  projectItem,
  pull,
  REPO,
  REPO_URL,
};
