// The closure snapshot that standards/project-workflow.md defines, built from GitHub REST GET
// requests only. Every read goes through one injected runner in github-client's convention, so the
// tests answer the same calls from fixtures. The shaping functions take data already read and return
// snapshot records; nothing here writes to GitHub.
// biome-ignore lint/correctness/noNodejsModules: This shipped command writes the snapshot file.
import { renameSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command reads its process id for the partial file.
import process from "node:process";
import { statusValueName } from "../project-status.mjs";
import { listOwnedProjects, readFallbackRequiredChecks } from "./github-client.mjs";
import {
  API_ISSUE_URL,
  API_PULL_URL,
  API_REPOSITORY_URL,
  isRepositoryName,
  urlReference,
  urlRepository,
} from "./repository-identity.mjs";

const ENDPOINT = /^(?:repos|users|orgs)\//u;
const HTTP_NOT_FOUND = /HTTP 404/u;
// The Project fields each item keeps, in the order the snapshot lists them.
const ITEM_FIELD_NAMES = ["Status", "Repository", "Parent issue", "Linked pull requests"];
const JSON_INDENT = 2;
const ISSUE_KEYS = ["body", "state_reason"];

class SnapshotReadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "SnapshotReadError";
  }
}

// Every failed read names its endpoint. An error built here passes through atEndpoint unchanged, so
// the message points at the read nearest the failure.
function readFailure(endpoint, detail, cause) {
  return new SnapshotReadError(`closure snapshot read failed: ${endpoint}: ${detail}`, { cause });
}

function messageOf(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNullOrString(value) {
  return value === null || typeof value === "string";
}

function nonBlank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function present(value) {
  return value !== undefined && value !== null;
}

function sameRepository(name, repository) {
  if (typeof name !== "string") {
    return false;
  }
  return name.toLowerCase() === repository.toLowerCase();
}

// Whether a URL names a repository through one of the two API patterns that carry one: a repository
// URL, or an issue URL, which names the repository its issue is in.
function namesRepository(url) {
  return urlRepository(url, API_REPOSITORY_URL) !== null || urlRepository(url, API_ISSUE_URL) !== null;
}

function endpointOf(args) {
  const endpoint = args.find((arg) => ENDPOINT.test(arg));
  if (endpoint === undefined) {
    return args.join(" ");
  }
  return endpoint;
}

function failureDetail(result) {
  const stderr = String(result?.stderr ?? "").trim();
  if (stderr.length > 0) {
    return stderr;
  }
  const stdout = String(result?.stdout ?? "").trim();
  if (stdout.length > 0) {
    return stdout;
  }
  return `gh exited with ${result?.status}`;
}

// Memoizes each read by its arguments and accepted exit codes, and never memoizes a failure, so a later
// read asks GitHub again. A non-zero exit counts only when the caller accepts it and it is HTTP 404, because
// every caller here that accepts one reads a 404 as absence; any other failure is a read failure naming its endpoint.
function guardedRunner(runner) {
  const memo = new Map();
  return (args, acceptedExitCodes = [0]) => {
    const key = JSON.stringify([args, acceptedExitCodes]);
    if (memo.has(key)) {
      return memo.get(key);
    }
    const endpoint = endpointOf(args);
    let result;
    try {
      result = runner(args, acceptedExitCodes);
    } catch (error) {
      throw readFailure(endpoint, messageOf(error), error);
    }
    const notFound = HTTP_NOT_FOUND.test(String(result?.stderr ?? ""));
    const accepted = acceptedExitCodes.includes(result?.status);
    if (!accepted || (result.status !== 0 && !notFound)) {
      throw readFailure(endpoint, failureDetail(result));
    }
    memo.set(key, result);
    return result;
  };
}

function readJson(read, endpoint, args) {
  const { stdout } = read(args);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw readFailure(endpoint, "did not return JSON", error);
  }
}

// A list that can span pages is read with --paginate --slurp, which returns one array per page.
function readPages(read, endpoint) {
  const pages = readJson(read, endpoint, ["api", "--paginate", "--slurp", endpoint]);
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    throw readFailure(endpoint, "missing page: every page must be an array");
  }
  return pages.flat();
}

// github-client's own shape checks name an endpoint only inside their text, so their failures are
// restated as read failures for the endpoint they came from.
function atEndpoint(endpoint, work) {
  try {
    return work();
  } catch (error) {
    if (error instanceof SnapshotReadError) {
      throw error;
    }
    throw readFailure(endpoint, messageOf(error), error);
  }
}

function isRepositoryNamed(data, repository) {
  return isObject(data) && sameRepository(data.full_name, repository);
}

function readRepository(read, repository) {
  const endpoint = `repos/${repository}`;
  const data = readJson(read, endpoint, ["api", endpoint]);
  if (!isRepositoryNamed(data, repository)) {
    throw readFailure(endpoint, `full_name must be ${repository}`);
  }
  if (!nonBlank(data.default_branch)) {
    throw readFailure(endpoint, "must include a non-blank default_branch");
  }
  return { fullName: data.full_name, defaultBranch: data.default_branch };
}

// The owner/name an item's content names, as GitHub spells it, or null for content that names none
// (a draft issue). A name or repository URL that is present and does not parse is a failed read, not a
// missing name.
function contentRepository(content, endpoint) {
  const fullName = content?.repository?.full_name;
  if (present(fullName)) {
    if (!isRepositoryName(fullName)) {
      throw readFailure(endpoint, "content repository full_name must name a repository");
    }
    return fullName;
  }
  if (!present(content?.repository_url)) {
    return null;
  }
  const repository = urlRepository(content.repository_url, API_REPOSITORY_URL);
  if (repository === null) {
    throw readFailure(endpoint, "content repository_url must name a repository");
  }
  return repository;
}

function holdsRepository(read, endpoint, repository) {
  return readPages(read, endpoint).some((item) =>
    sameRepository(contentRepository(item?.content, endpoint), repository),
  );
}

function isProjectEntry(project) {
  return positiveInteger(project?.number) && nonBlank(project.state);
}

function describeFound(projects) {
  if (projects.length === 0) {
    return "none";
  }
  const numbers = projects.map(({ number }) => `#${number}`).join(", ");
  return `${projects.length} (${numbers})`;
}

// The open Project that holds an item of the repository, by github-client's membership rule. A Project
// item with no derivable repository cannot be a member, so it is passed over rather than failing the
// build. Closed Projects are never read.
function linkedProject(read, owner, repository) {
  const { basePath, projects } = atEndpoint(`users/${owner}/projectsV2`, () => listOwnedProjects(owner, read));
  const linked = [];
  for (const project of projects) {
    if (!isProjectEntry(project)) {
      throw readFailure(`${basePath}/projectsV2`, "every Project must carry a number and a state");
    }
    const open = project.state.trim().toLowerCase() === "open";
    const endpoint = `${basePath}/projectsV2/${project.number}/items?per_page=100`;
    if (open && holdsRepository(read, endpoint, repository)) {
      linked.push(project);
    }
  }
  if (linked.length !== 1) {
    const found = describeFound(linked);
    throw readFailure(`${basePath}/projectsV2`, `expected exactly one open linked Project, found ${found}`);
  }
  return { basePath, project: linked[0] };
}

// A Status name read from one REST value. A value that is present but unreadable fails the build,
// naming what it was read from, so no caller can write over a value nobody could read.
function readStatusName(value, subject, endpoint) {
  try {
    return statusValueName(value);
  } catch (error) {
    throw readFailure(endpoint, `${subject} is unreadable: ${messageOf(error)}`, error);
  }
}

function isSingleSelectStatus(status) {
  return status.data_type === "single_select" && Array.isArray(status.options) && nonBlank(status.node_id);
}

// The Project fields the snapshot reads, each found by its name. A missing or repeated name fails the
// build, because a wrong field would silently change what the snapshot says about every item.
function projectFields(read, basePath, number) {
  const endpoint = `${basePath}/projectsV2/${number}/fields?per_page=100`;
  const fields = readPages(read, endpoint);
  const named = (name) => {
    const matches = fields.filter((field) => isObject(field) && field.name === name);
    if (matches.length !== 1) {
      throw readFailure(endpoint, `must include exactly one "${name}" field, found ${matches.length}`);
    }
    if (!positiveInteger(matches[0].id)) {
      throw readFailure(endpoint, `the "${name}" field must carry a numeric id`);
    }
    return matches[0];
  };
  const status = named("Status");
  if (!isSingleSelectStatus(status)) {
    throw readFailure(endpoint, 'the "Status" field must be single-select with options and a node_id');
  }
  const done = status.options.filter(
    (option) => readStatusName(option, "a Status option name", endpoint) === "Done",
  );
  if (done.length !== 1 || !nonBlank(done[0].id)) {
    throw readFailure(endpoint, `must include exactly one Status option named Done, found ${done.length}`);
  }
  return {
    statusFieldId: status.node_id,
    doneOptionId: done[0].id,
    fieldIds: ITEM_FIELD_NAMES.map((name) => named(name).id),
  };
}

// A field's value from one item. Absent means the item holds no value for that field, which the
// snapshot records as null; a field listed twice is a failed read.
function fieldValue(fields, id, subject, endpoint) {
  if (!Array.isArray(fields)) {
    return null;
  }
  const matches = fields.filter((field) => String(field?.id) === String(id));
  if (matches.length > 1) {
    throw readFailure(endpoint, `${subject} repeats field ${id}`);
  }
  return matches[0]?.value ?? null;
}

function contentNumber(content, subject, endpoint) {
  if (content.number === undefined || content.number === null) {
    return null;
  }
  if (!positiveInteger(content.number)) {
    throw readFailure(endpoint, `${subject} has a content number that is not a positive integer`);
  }
  return content.number;
}

function bareOrFullName(value) {
  // ASSUMPTION: the Repository field may also carry the bare owner/name string, which the plan does
  // not name. Reading it the same way is safer than failing a live build over the spelling.
  if (typeof value === "string") {
    return value;
  }
  return value?.full_name;
}

function repositoryValue(value, subject, endpoint) {
  if (value === null) {
    return null;
  }
  const name = bareOrFullName(value);
  if (!nonBlank(name)) {
    throw readFailure(endpoint, `${subject} has a Repository value with no full_name`);
  }
  if (!isRepositoryName(name)) {
    throw readFailure(endpoint, `${subject} has a Repository value that names no repository`);
  }
  return name;
}

function parentValue(value, subject, endpoint) {
  if (value === null) {
    return null;
  }
  // ASSUMPTION: the Parent issue value's URLs are API URLs, as every other value the snapshot reads is,
  // so a present URL that names no repository fails the read rather than being skipped for the other URL.
  if (![value?.repository_url, value?.url].filter(present).every(namesRepository)) {
    throw readFailure(endpoint, `${subject} has a Parent issue URL that names no repository`);
  }
  // ASSUMPTION: the Parent issue value names its issue by an issue URL in repository_url or url.
  const issue = urlReference(value?.repository_url, API_ISSUE_URL) ?? urlReference(value?.url, API_ISSUE_URL);
  if (issue !== null) {
    return issue;
  }
  const repository = urlRepository(value?.repository_url, API_REPOSITORY_URL);
  // ASSUMPTION: when only a repository URL is present, the value's own number names the issue.
  if (repository !== null && positiveInteger(value?.number)) {
    return { repository, number: value.number };
  }
  throw readFailure(endpoint, `${subject} has a Parent issue value that names no issue`);
}

function linkedPullValues(value, subject, endpoint) {
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw readFailure(endpoint, `${subject} has a Linked pull requests value that is not a list`);
  }
  return value;
}

// A linked pull request's repository is the one its API URL names. Without a URL it is the base
// repository's. A URL or base repository that is present and names no repository fails the read, so no
// other name stands in for it.
function pullRepository(pull, reference, subject, endpoint) {
  if (reference !== null) {
    return reference.repository;
  }
  if (present(pull?.url)) {
    throw readFailure(endpoint, `${subject} has a linked pull request URL that names no pull request`);
  }
  const base = pull?.base?.repo?.full_name;
  if (present(base) && !isRepositoryName(base)) {
    throw readFailure(endpoint, `${subject} has a linked pull request base repository that names no repository`);
  }
  return base ?? null;
}

function pullNumber(pull, reference) {
  if (positiveInteger(pull?.number)) {
    return pull.number;
  }
  return reference?.number ?? null;
}

function isPullReference(repository, number) {
  return nonBlank(repository) && positiveInteger(number);
}

function pullReference(pull, subject, endpoint) {
  const reference = urlReference(pull?.url, API_PULL_URL);
  const repository = pullRepository(pull, reference, subject, endpoint);
  const number = pullNumber(pull, reference);
  if (!isPullReference(repository, number)) {
    throw readFailure(endpoint, `${subject} has a linked pull request with no repository or number`);
  }
  return { repository, number };
}

function isItemEntry(raw) {
  return isObject(raw) && nonBlank(raw.node_id) && positiveInteger(raw.id);
}

// One Project item in the snapshot's shape. It keeps the raw content and linked pull request objects
// too, because the issue and pull request records are built from them.
function shapeItem(raw, fieldIds, endpoint) {
  if (!isItemEntry(raw)) {
    throw readFailure(endpoint, "every item must carry a node_id and a numeric id");
  }
  const subject = `item ${raw.node_id}`;
  const content = raw.content ?? {};
  if (!isObject(content)) {
    throw readFailure(endpoint, `${subject} has content that is not an object`);
  }
  const [statusId, repositoryId, parentId, linkedId] = fieldIds;
  const field = (id) => fieldValue(raw.fields, id, subject, endpoint);
  const pulls = linkedPullValues(field(linkedId), subject, endpoint);
  const repository = contentRepository(content, endpoint);
  return {
    item: {
      id: raw.node_id,
      databaseId: raw.id,
      contentType: raw.content_type ?? null,
      repository,
      content: { number: contentNumber(content, subject, endpoint), repository },
      fields: [
        { name: "Status", value: readStatusName(field(statusId), `${subject} Status`, endpoint) },
        { name: "Repository", value: repositoryValue(field(repositoryId), subject, endpoint) },
        { name: "Parent issue", value: parentValue(field(parentId), subject, endpoint) },
        { name: "Linked pull requests", value: pulls.map((pull) => pullReference(pull, subject, endpoint)) },
      ],
    },
    content,
    pulls,
  };
}

function isSubIssueEntry(child) {
  const repository = urlRepository(child?.repository_url, API_REPOSITORY_URL);
  return isObject(child) && repository !== null && positiveInteger(child.number);
}

function readChildren(read, repository, number) {
  const endpoint = `repos/${repository}/issues/${number}/sub_issues?per_page=100`;
  return readPages(read, endpoint).map((child) => {
    if (!isSubIssueEntry(child)) {
      throw readFailure(endpoint, "every sub-issue must name its repository_url and number");
    }
    return { repository: urlRepository(child.repository_url, API_REPOSITORY_URL), number: child.number };
  });
}

function isCommentEntry(comment) {
  return isObject(comment) && comment.id !== undefined && comment.id !== null && typeof comment.body === "string";
}

function readComments(read, repository, number) {
  const endpoint = `repos/${repository}/issues/${number}/comments?per_page=100`;
  return readPages(read, endpoint).map((comment) => {
    if (!isCommentEntry(comment)) {
      throw readFailure(endpoint, "every comment must carry an id and a string body");
    }
    return { id: comment.id, body: comment.body };
  });
}

function issueParent(content, endpoint) {
  const { number } = content;
  // body and state_reason must be present even when null, because the closure rules read the
  // acceptance criteria and supersedes records from them; an absent key must never read as "no
  // criteria", since that would let a close go through on a guess.
  if (!ISSUE_KEYS.every((key) => key in content)) {
    throw readFailure(endpoint, `issue #${number} content must carry body and state_reason`);
  }
  if (![content.body, content.state_reason].every(isNullOrString)) {
    throw readFailure(endpoint, `issue #${number} body and state_reason must be strings or null`);
  }
  // ASSUMPTION: REST omits parent_issue_url for an issue that has no parent, so an absent key reads as
  // no parent. A present value must still name an issue, so a malformed link fails the build rather
  // than reading as no parent.
  if (content.parent_issue_url === undefined || content.parent_issue_url === null) {
    return null;
  }
  const parent = urlReference(content.parent_issue_url, API_ISSUE_URL);
  if (parent === null) {
    throw readFailure(endpoint, `issue #${number} parent_issue_url must name an issue`);
  }
  return parent;
}

// A count of exactly zero is the only skip. A missing count reads, so a childless parent is never
// assumed from an absent count.
function childrenOf(content, repository, number, read) {
  if (content.sub_issues_summary?.total === 0) {
    return [];
  }
  return readChildren(read, repository, number);
}

function commentsOf(content, repository, number, read) {
  if (content.comments === 0) {
    return [];
  }
  return readComments(read, repository, number);
}

function isIssueItem(content) {
  return positiveInteger(content.number) && nonBlank(content.state);
}

function issueRecord(content, repository, read) {
  if (!isIssueItem(content)) {
    throw readFailure(`repos/${repository}/issues`, "an issue item must carry a number and a state");
  }
  const { number } = content;
  const parent = issueParent(content, `repos/${repository}/issues/${number}`);
  return {
    number,
    repository,
    state: content.state,
    state_reason: content.state_reason,
    title: content.title ?? null,
    body: content.body,
    parent,
    children: childrenOf(content, repository, number, read),
    comments: commentsOf(content, repository, number, read),
  };
}

// A pull request is merged once GitHub gives it a merge time. GitHub also fills merge_commit_sha on an
// open pull request with a test-merge commit, so only the merge time decides whether a merge commit exists.
function isMerged(pull) {
  return nonBlank(pull.merged_at);
}

function mergeCommitOf(pull) {
  if (isMerged(pull) && nonBlank(pull.merge_commit_sha)) {
    return { oid: pull.merge_commit_sha };
  }
  return null;
}

// The merge time of a merged pull request, or null, so mergedAt agrees with the merge commit and checks.
function mergedAtOf(pull) {
  if (isMerged(pull)) {
    return pull.merged_at;
  }
  return null;
}

// Only a merged pull request has required checks to read; an open one has none to satisfy yet.
function requiredChecksOf(pull, { repository, head, base, read }) {
  if (!isMerged(pull)) {
    return null;
  }
  return atEndpoint(`repos/${repository}/commits/${head.sha}`, () =>
    readFallbackRequiredChecks(repository, { baseBranch: base.ref, headSha: head.sha }, read),
  );
}

// One target pull request, from the full REST pull request object its Project item links.
function pullRequestRecord(pull, { repository, number, endpoint, read }) {
  const headRepository = pull.head?.repo?.full_name ?? null;
  if (headRepository !== null && !isRepositoryName(headRepository)) {
    throw readFailure(endpoint, `pull request #${number} head repository names no repository`);
  }
  const head = { repository: headRepository, ref: pull.head?.ref, sha: pull.head?.sha };
  const base = { ref: pull.base?.ref, sha: pull.base?.sha };
  if (![pull.state, head.ref, head.sha, base.ref, base.sha].every(nonBlank)) {
    throw readFailure(endpoint, `pull request #${number} must carry a state, head and base refs, and SHAs`);
  }
  return {
    number,
    repository,
    state: pull.state,
    mergedAt: mergedAtOf(pull),
    head,
    base,
    mergeCommit: mergeCommitOf(pull),
    requiredChecks: requiredChecksOf(pull, { repository, head, base, read }),
  };
}

// The target pull requests the target items link, each once, in Project order. A linked pull request
// from another repository is a relation the planner reports, not a record the snapshot lists.
function pullRequestRecords(targets, repository, read, endpoint) {
  const records = new Map();
  for (const { item, pulls } of targets) {
    for (const pull of pulls) {
      const reference = pullReference(pull, `item ${item.id}`, endpoint);
      const key = `${reference.repository.toLowerCase()}#${reference.number}`;
      if (sameRepository(reference.repository, repository) && !records.has(key)) {
        records.set(key, pullRequestRecord(pull, { repository, number: reference.number, endpoint, read }));
      }
    }
  }
  return [...records.values()];
}

// Builds the snapshot for one repository. Every read goes through the runner and nothing is written.
export function buildClosureSnapshot({ repository, runner }) {
  const read = guardedRunner(runner);
  const repo = readRepository(read, repository);
  const [owner] = repo.fullName.split("/");
  const { basePath, project } = linkedProject(read, owner, repo.fullName);
  const fields = projectFields(read, basePath, project.number);
  const itemsEndpoint =
    `${basePath}/projectsV2/${project.number}/items?per_page=100&fields=${fields.fieldIds.join(",")}`;
  const shaped = readPages(read, itemsEndpoint).map((raw) => shapeItem(raw, fields.fieldIds, itemsEndpoint));
  const targets = shaped.filter(({ item }) => sameRepository(item.repository, repo.fullName));
  const issues = targets
    .filter(({ item }) => item.contentType === "Issue")
    // ASSUMPTION: the Project item's content carries the issue fields the snapshot keeps, so no
    // per-issue read is made.
    .map(({ content }) => issueRecord(content, repo.fullName, read));
  return {
    repository: repo.fullName,
    defaultBranch: repo.defaultBranch,
    project: {
      owner,
      number: project.number,
      statusFieldId: fields.statusFieldId,
      doneOptionId: fields.doneOptionId,
    },
    items: shaped.map(({ item }) => item),
    issues,
    pullRequests: pullRequestRecords(targets, repo.fullName, read, itemsEndpoint),
  };
}

// Writes the snapshot through a sibling partial file that is renamed onto the output, and a failed
// write removes that partial file. The CLI removes any earlier output before the read starts.
export function writeClosureSnapshot(output, snapshot) {
  const partial = `${output}.partial-${process.pid}`;
  try {
    writeFileSync(partial, `${JSON.stringify(snapshot, null, JSON_INDENT)}\n`);
    renameSync(partial, output);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
}
