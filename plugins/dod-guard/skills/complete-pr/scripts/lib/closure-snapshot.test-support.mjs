// REST fixtures for the closure snapshot builder: the fake REST runner, the GitHub object shapes
// the builder reads (Project items, fields, issues, pull requests, check runs), and the ENDPOINT
// path builders. fakeRest takes its routes as a parameter, and each test file builds its own route
// table from these. The *.test-support.mjs name keeps the test glob from running it as a test.

const OWNER = "TychoHenzen";
const REPO = `${OWNER}/dod-guard`;
const FOREIGN = `${OWNER}/DeepSeekCustom`;
const REPO_URL = `https://api.github.com/repos/${REPO}`;
const FIELD_IDS = [101, 102, 103, 104];
const MERGED_AT = "2026-10-08T17:13:52Z";
const BASE_SHA = "c0".repeat(20);

const ENDPOINT = {
  repository: `repos/${REPO}`,
  projects: `users/${OWNER}/projectsV2?per_page=100`,
  membership: (number) => `users/${OWNER}/projectsV2/${number}/items?per_page=100`,
  fields: (number) => `users/${OWNER}/projectsV2/${number}/fields?per_page=100`,
  values: (number) => `users/${OWNER}/projectsV2/${number}/items?per_page=100&fields=${FIELD_IDS.join(",")}`,
  subIssues: (number) => `repos/${REPO}/issues/${number}/sub_issues?per_page=100`,
  comments: (number) => `repos/${REPO}/issues/${number}/comments?per_page=100`,
  protection: `repos/${REPO}/branches/master/protection/required_status_checks`,
  checkRuns: (sha) => `repos/${REPO}/commits/${sha}/check-runs?per_page=100`,
  statuses: (sha) => `repos/${REPO}/commits/${sha}/status?per_page=100`,
};

function ok(value) {
  return { status: 0, stdout: JSON.stringify(value), stderr: "" };
}

function failed(stderr) {
  return { status: 1, stdout: "", stderr };
}

const SERVER_ERROR = failed("gh: Server Error (HTTP 500)");
const NOT_FOUND = failed("gh: Not Found (HTTP 404)");

// Answers each endpoint from its route and honors acceptedExitCodes the way github-client's runGh
// does. An endpoint without a route throws, so a read the fixture does not expect fails the test.
function fakeRest(routes) {
  const calls = [];
  const runner = (args, acceptedExitCodes = [0]) => {
    calls.push(args);
    const endpoint = args.at(-1);
    const reply = routes[endpoint];
    if (reply === undefined) {
      throw new Error(`no fixture for ${endpoint}`);
    }
    if (!acceptedExitCodes.includes(reply.status)) {
      throw new Error(reply.stderr || reply.stdout || `gh exited with ${reply.status}`);
    }
    return reply;
  };
  return { runner, calls };
}

function issueUrl(url, parent) {
  if (parent === null) {
    return null;
  }
  return `${url}/issues/${parent}`;
}

// parentRepo names the repository of the parent issue, which may differ from the issue's own repository.
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
    comments = 0,
  } = {},
) {
  const url = `https://api.github.com/repos/${repo}`;
  return {
    number,
    title: `Issue ${number}`,
    state,
    state_reason: stateReason,
    body,
    repository: { full_name: repo },
    repository_url: url,
    parent_issue_url: issueUrl(`https://api.github.com/repos/${parentRepo}`, parent),
    sub_issues_summary: { total: subIssues, completed: 0, percent_completed: 0 },
    comments,
  };
}

function parentFieldValue(parent, repo = REPO) {
  if (parent === null) {
    return null;
  }
  const url = `https://api.github.com/repos/${repo}`;
  return { repository_url: url, url: `${url}/issues/${parent}`, number: parent };
}

// A Project item as the --slurp items read returns it. The Status value uses the REST spelling
// {id, name: {raw, html}}. The Title field is not one the snapshot keeps, so it proves the shaping
// ignores fields it was not asked for.
function projectItem(
  nodeId,
  databaseId,
  content,
  { status = "Backlog", parent = null, parentRepo = REPO, linked = [] } = {},
) {
  return {
    id: databaseId,
    node_id: nodeId,
    content_type: "Issue",
    content,
    fields: [
      { id: 900, name: "Title", value: content.title },
      { id: 101, name: "Status", value: { id: `opt-${status.toLowerCase()}`, name: { raw: status, html: status } } },
      { id: 102, name: "Repository", value: { full_name: content.repository.full_name } },
      { id: 103, name: "Parent issue", value: parentFieldValue(parent, parentRepo) },
      { id: 104, name: "Linked pull requests", value: linked },
    ],
  };
}

function landing(merged, mergeCommit) {
  if (!merged) {
    return { merged_at: null, merge_commit_sha: null };
  }
  return { merged_at: MERGED_AT, merge_commit_sha: mergeCommit };
}

// A full REST pull request object, as a Linked pull requests value carries it.
function pull(number, { repo = REPO, state = "closed", sha, merged = true, mergeCommit = null } = {}) {
  return {
    number,
    url: `https://api.github.com/repos/${repo}/pulls/${number}`,
    state,
    ...landing(merged, mergeCommit),
    head: { ref: `codex/${number}`, sha, repo: { full_name: repo } },
    base: { ref: "master", sha: BASE_SHA, repo: { full_name: repo } },
  };
}

// The Status options spell their names both ways: Backlog and Done as {raw, html}, Todo as a bare
// string. The fields list is split across two pages, as a long Project's list is.
function fieldPages({ withParent = true } = {}) {
  const status = {
    id: 101,
    node_id: "PVTSSF_status",
    name: "Status",
    data_type: "single_select",
    options: [
      { id: "opt-backlog", name: { raw: "Backlog", html: "Backlog" } },
      { id: "opt-todo", name: "Todo" },
      { id: "opt-done", name: { raw: "Done", html: "Done" } },
    ],
  };
  const repository = { id: 102, node_id: "PVTF_repository", name: "Repository", data_type: "repository" };
  const parent = { id: 103, node_id: "PVTF_parent", name: "Parent issue", data_type: "parent_issue" };
  const linked = { id: 104, node_id: "PVTF_linked", name: "Linked pull requests", data_type: "pull_request" };
  const title = { id: 900, node_id: "PVTF_title", name: "Title", data_type: "title" };
  if (!withParent) {
    return [[status, repository], [linked, title]];
  }
  return [[status, repository], [parent, linked, title]];
}

function checkRunsReply(sha) {
  return ok([
    { total_count: 1, check_runs: [{ name: "build-test", head_sha: sha, status: "completed", conclusion: "success" }] },
  ]);
}

function commitStatusReply(sha) {
  return ok([{ sha, state: "success", statuses: [{ context: "lint", state: "success", sha }] }]);
}

export {
  BASE_SHA,
  ENDPOINT,
  FOREIGN,
  MERGED_AT,
  NOT_FOUND,
  OWNER,
  REPO,
  REPO_URL,
  SERVER_ERROR,
  checkRunsReply,
  commitStatusReply,
  fakeRest,
  fieldPages,
  issueContent,
  ok,
  projectItem,
  pull,
};
