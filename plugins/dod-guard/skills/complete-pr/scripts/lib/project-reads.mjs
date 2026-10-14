// Every REST read of a GitHub Project that complete-pr's scripts make: the owned-Project listing, the
// open-Project loop, the Status-value flattener, and the issue-item resolver built on them.
// readIssueProjectStatuses wants the open Project holding exactly one item for one issue and stops on
// an item it cannot place. Which Project a repository is linked to is a different rule, read from the
// explicit link by plugins/dod-guard/lib/linked-project.mjs. Every read goes through an injected
// runner in gh-runner's convention.
import { API_REPOSITORY_URL, isRepositoryName, urlRepository } from "../../../../lib/repository-identity.mjs";
import { ghJson, ghJsonArrayPages, githubResponseContractError, githubResponseError } from "./gh-runner.mjs";

const HTTP_NOT_FOUND = /HTTP 404/;
const JSON_LINE_SEPARATOR = /\r?\n/u;
const PROJECT_REPOSITORY_IDENTITY_KEYS = ["full_name", "fullName"];
const PROJECT_ITEM_IDENTITY_JQ =
  ".[] | {id: .id, node_id: .node_id, content: {number: .content.number, repository: {full_name: .content.repository.full_name, fullName: .content.repository.fullName}, repository_url: .content.repository_url}}";

// A failed read that names the endpoint it came from. A caller with its own error convention restates
// it from endpoint and detail.
export class ProjectReadError extends Error {
  constructor(endpoint, detail, options) {
    super(`${endpoint}: ${detail}`, options);
    this.name = "ProjectReadError";
    this.endpoint = endpoint;
    this.detail = detail;
  }
}

// REST spells a Status name as a bare string, as {name: "..."}, or as {name: {raw, html}}, and the
// spellings must agree or the value says two things at once. An absent value is no name and gives
// null. A blank, contradictory, or unrecognized value throws, so no caller reads a name it cannot
// verify.
const NAME_SPELLINGS = ["raw", "html"];

// statusValueReason lets a caller map each rejection to its own stop text without matching the
// message.
function statusValueError(reason, message) {
  return Object.assign(new Error(message), { statusValueReason: reason });
}

function nameSpellings(name) {
  if (typeof name === "string") {
    return [name];
  }
  if (name === null || typeof name !== "object") {
    return [];
  }
  return NAME_SPELLINGS.filter((key) => key in name).map((key) => name[key]);
}

function valueSpellings(value) {
  if (typeof value === "string") {
    return [value];
  }
  return nameSpellings(value.name);
}

export function statusValueName(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const spellings = valueSpellings(value);
  if (spellings.length === 0) {
    throw statusValueError("not-a-name", "Status value is not a name.");
  }
  if (spellings.some((name) => typeof name !== "string" || name.trim().length === 0)) {
    throw statusValueError("blank", "Status value has a blank name.");
  }
  if (new Set(spellings).size !== 1) {
    throw statusValueError("disagree", "Status value names disagree.");
  }
  return spellings[0];
}

const ITEM_STATUS_STOPS = {
  "not-a-name": "exactly one non-blank Status field/value",
  blank: "exactly one non-blank Status field/value",
  disagree: "one non-contradictory Status field/value",
};

// The Status name of one item read with ?fields=<statusFieldId>. The item must carry exactly that one
// field, and its value must flatten to one name; an absent value is a stop here, not null.
function projectStatusName(item, statusFieldId, endpoint) {
  if (!Array.isArray(item?.fields) || item.fields.length !== 1) {
    throw githubResponseContractError(endpoint, "exactly one Status field/value");
  }
  const [statusField] = item.fields;
  if (
    String(statusField?.id ?? "") !== String(statusFieldId) ||
    typeof statusField?.name !== "string" ||
    statusField.name.toLowerCase() !== "status"
  ) {
    throw githubResponseContractError(endpoint, "exactly one Status field/value");
  }

  let name;
  try {
    name = statusValueName(statusField.value);
  } catch (error) {
    const stop = ITEM_STATUS_STOPS[error?.statusValueReason];
    if (stop !== undefined) {
      throw githubResponseContractError(endpoint, stop);
    }
    throw error;
  }
  if (name === null) {
    throw githubResponseContractError(endpoint, "exactly one non-blank Status field/value");
  }
  return name;
}

function listOwnedProjects(owner, commandRunner) {
  const userEndpoint = `users/${owner}/projectsV2?per_page=100`;
  const userResponse = ghJson(["api", "--paginate", "--slurp", userEndpoint], [0, 1], commandRunner);
  if (userResponse.result.status === 0) {
    const pages = userResponse.data;
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
      throw githubResponseError(userEndpoint, "an array response");
    }
    return { basePath: `users/${owner}`, projects: pages.flat() };
  }
  if (!HTTP_NOT_FOUND.test(userResponse.result.stderr)) {
    throw new Error(userResponse.result.stderr.trim() || "Failed to list user-owned Projects.");
  }
  const orgEndpoint = `orgs/${owner}/projectsV2?per_page=100`;
  return {
    basePath: `orgs/${owner}`,
    projects: ghJsonArrayPages(orgEndpoint, commandRunner),
  };
}

// checkEntry runs on every listed Project, closed ones included, so a malformed entry stops the read
// wherever it is; visit runs on each open one, in listing order.
function forEachOpenProject(projects, checkEntry, visit) {
  for (const project of projects) {
    checkEntry(project);
    if (project.state.trim().toLowerCase() === "open") {
      visit(project);
    }
  }
}

function repositoryName(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function ghJsonLines(endpoint, filter, commandRunner) {
  const result = commandRunner(["api", "--paginate", "--jq", filter, endpoint], [0]);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `gh exited with ${result.status}`);
  }
  const lines = String(result.stdout ?? "")
    .split(JSON_LINE_SEPARATOR)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    throw githubResponseContractError(endpoint, "newline-delimited JSON Project items");
  }
}

function projectItemRepository(item, endpoint) {
  const content = item?.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw githubResponseContractError(endpoint, "Project items with content identity");
  }
  const repository = content.repository;
  if (!repository || typeof repository !== "object" || Array.isArray(repository)) {
    throw githubResponseContractError(endpoint, "Project items with repository identity");
  }
  const url = content.repository_url;
  const identities = [];
  for (const key of PROJECT_REPOSITORY_IDENTITY_KEYS) {
    const fullName = repository[key];
    if (fullName !== undefined && fullName !== null) {
      const normalized = repositoryName(fullName);
      if (normalized === null) {
        throw githubResponseContractError(endpoint, "a non-blank repository identity");
      }
      identities.push(normalized);
    }
  }
  if (url !== undefined && url !== null) {
    const match = typeof url === "string" && url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/i);
    if (!match) {
      throw githubResponseContractError(endpoint, "a canonical repository URL");
    }
    identities.push(repositoryName(match[1]));
  }
  if (identities.length === 0) {
    throw githubResponseContractError(endpoint, "a non-blank repository identity");
  }
  if (new Set(identities).size > 1) {
    throw githubResponseContractError(endpoint, "one non-contradictory repository identity");
  }
  return identities[0];
}

function projectItemIssueNumber(item, endpoint) {
  const value = item?.content?.number;
  const number = Number(value);
  if (value === undefined || value === null || !Number.isInteger(number) || number <= 0) {
    throw githubResponseContractError(endpoint, "a valid issue number");
  }
  return number;
}

function projectItemId(item, endpoint) {
  const id = item?.id;
  if (id === undefined || id === null || String(id).trim().length === 0) {
    throw githubResponseError(endpoint, "items with IDs");
  }
  return String(id);
}

function projectItemsForRead(endpoint, commandRunner) {
  const items = ghJsonLines(endpoint, PROJECT_ITEM_IDENTITY_JQ, commandRunner);
  const seenIds = new Set();
  const seenNodeIds = new Set();
  const seenMembership = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object") {
      throw githubResponseContractError(endpoint, "object Project items");
    }
    const id = projectItemId(item, endpoint);
    const nodeId = item.node_id ?? item.nodeId;
    if (nodeId === undefined || nodeId === null || String(nodeId).trim().length === 0) {
      throw githubResponseError(endpoint, "items with global IDs");
    }
    if (seenIds.has(id) || seenNodeIds.has(String(nodeId))) {
      throw githubResponseContractError(endpoint, "unique Project items");
    }
    seenIds.add(id);
    seenNodeIds.add(String(nodeId));
    const itemRepository = projectItemRepository(item, endpoint);
    const number = projectItemIssueNumber(item, endpoint);
    const membership = `${itemRepository}#${number}`;
    if (seenMembership.has(membership)) {
      throw githubResponseContractError(
        endpoint,
        "unique repository issue membership; exactly one matching issue item",
      );
    }
    seenMembership.add(membership);
  }
  return items;
}

function projectItemMatchesRepository(item, repository, issueNumber, endpoint) {
  const number = projectItemIssueNumber(item, endpoint);
  const itemRepository = projectItemRepository(item, endpoint);
  return number === issueNumber && itemRepository === repositoryName(repository);
}

function validateProjectItemReadback(item, expectedItem, repository, issueNumber, endpoint) {
  const expectedId = projectItemId(expectedItem, endpoint);
  const actualId = projectItemId(item, endpoint);
  const expectedNodeId = String(expectedItem.node_id ?? expectedItem.nodeId ?? "");
  const actualNodeId = String(item?.node_id ?? item?.nodeId ?? "");
  if (
    expectedNodeId.length === 0 ||
    actualNodeId.length === 0 ||
    expectedId !== actualId ||
    expectedNodeId !== actualNodeId
  ) {
    throw githubResponseContractError(endpoint, "the same Project item IDs as the membership read");
  }
  if (!projectItemMatchesRepository(item, repository, issueNumber, endpoint)) {
    throw githubResponseContractError(endpoint, "the same repository and issue identity as the membership read");
  }
}

function checkListedIssueProject(project, basePath) {
  if (project?.number === undefined || project?.number === null) {
    throw githubResponseError(`${basePath}/projectsV2`, "projects with a number");
  }
  if (typeof project?.state !== "string" || project.state.trim().length === 0) {
    throw githubResponseContractError(`${basePath}/projectsV2`, "projects with an explicit state");
  }
}

// The Status of one issue in the one open Project that holds exactly one item for it. An item whose
// repository cannot be read stops the read, because it could be the issue's own item.
export function readIssueProjectStatuses(repository, issueNumber, commandRunner) {
  const separator = repository.indexOf("/");
  if (separator <= 0 || separator === repository.length - 1) {
    throw new Error("Repository must be in owner/name form.");
  }
  const owner = repository.slice(0, separator);
  const { basePath, projects } = listOwnedProjects(owner, commandRunner);
  const linkedProjects = [];

  forEachOpenProject(
    projects,
    (project) => checkListedIssueProject(project, basePath),
    (project) => {
      const projectPath = `${basePath}/projectsV2/${project.number}`;
      const itemsEndpoint = `${projectPath}/items?per_page=100`;
      const matchingItems = projectItemsForRead(itemsEndpoint, commandRunner).filter((item) =>
        projectItemMatchesRepository(item, repository, issueNumber, itemsEndpoint),
      );
      if (matchingItems.length === 0) {
        return;
      }
      if (matchingItems.length !== 1) {
        throw githubResponseContractError(itemsEndpoint, "exactly one matching issue item");
      }
      linkedProjects.push({ project, item: matchingItems[0] });
    },
  );

  if (linkedProjects.length !== 1) {
    throw githubResponseContractError(`${basePath}/projectsV2`, "exactly one open linked Project");
  }

  const { project, item } = linkedProjects[0];
  const projectPath = `${basePath}/projectsV2/${project.number}`;
  const fieldsEndpoint = `${projectPath}/fields?per_page=100`;
  const statusFields = ghJsonArrayPages(fieldsEndpoint, commandRunner).filter(
    (field) => typeof field?.name === "string" && field.name.toLowerCase() === "status",
  );
  if (statusFields.length !== 1 || statusFields[0].id === undefined || statusFields[0].id === null) {
    throw githubResponseError(fieldsEndpoint, "exactly one Status field");
  }
  const statusFieldId = statusFields[0].id;
  projectItemId(item, `${projectPath}/items?per_page=100`);

  const itemEndpoint = `${projectPath}/items/${item.id}?fields=${statusFieldId}`;
  const { data } = ghJson(["api", itemEndpoint], [0], commandRunner);
  validateProjectItemReadback(data, item, repository, issueNumber, itemEndpoint);
  return [projectStatusName(data, statusFieldId, itemEndpoint)];
}

// A list that can span pages, read with --paginate --slurp, which returns one array per page.
export function readSlurpedPages(read, endpoint) {
  const { stdout } = read(["api", "--paginate", "--slurp", endpoint]);
  let pages;
  try {
    pages = JSON.parse(stdout);
  } catch (error) {
    throw new ProjectReadError(endpoint, "did not return JSON", { cause: error });
  }
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    throw new ProjectReadError(endpoint, "missing page: every page must be an array");
  }
  return pages.flat();
}

export function sameRepository(name, repository) {
  if (typeof name !== "string") {
    return false;
  }
  return name.toLowerCase() === repository.toLowerCase();
}

// The owner/name an item's content names, as GitHub spells it, or null for content that names none
// (a draft issue). A name or repository URL that is present and does not parse is a failed read, not a
// missing name.
export function contentRepository(content, endpoint) {
  const fullName = content?.repository?.full_name;
  if (fullName !== undefined && fullName !== null) {
    if (!isRepositoryName(fullName)) {
      throw new ProjectReadError(endpoint, "content repository full_name must name a repository");
    }
    return fullName;
  }
  if (content?.repository_url === undefined || content?.repository_url === null) {
    return null;
  }
  const repository = urlRepository(content.repository_url, API_REPOSITORY_URL);
  if (repository === null) {
    throw new ProjectReadError(endpoint, "content repository_url must name a repository");
  }
  return repository;
}
