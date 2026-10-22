import { ghJson, ghJsonArrayPages, githubResponseContractError, githubResponseError } from "./gh-runner.mjs";
import { ISSUE_PROJECT_ITEMS_READ, readIssueProjectItems } from "./issue-project-items.mjs";
import { isPresent, projectItemId } from "./project-item-ids.mjs";
import { projectItemsForRead } from "./project-item-list.mjs";
import { projectItemMatchesRepository, validateProjectItemReadback } from "./project-item-readback.mjs";
import { projectStatusName } from "./project-item-status.mjs";
import { checkListedIssueProject, forEachOpenProject, listOwnedProjects } from "./project-listing.mjs";

function ownerOf(repository) {
  const separator = repository.indexOf("/");
  if (separator <= 0 || separator === repository.length - 1) {
    throw new Error("Repository must be in owner/name form.");
  }
  return repository.slice(0, separator);
}

function linkedItem(project, { basePath, issue, commandRunner }) {
  const itemsEndpoint = `${basePath}/projectsV2/${project.number}/items?per_page=100`;
  const matching = projectItemsForRead(itemsEndpoint, commandRunner).filter((item) =>
    projectItemMatchesRepository(item, issue, itemsEndpoint),
  );
  if (matching.length > 1) {
    throw githubResponseContractError(itemsEndpoint, "exactly one matching issue item");
  }
  return matching[0] ?? null;
}

function singleLinkedProject(context, projects) {
  const linked = [];
  forEachOpenProject(
    projects,
    (project) => checkListedIssueProject(project, context.basePath),
    (project) => {
      const item = linkedItem(project, context);
      if (item !== null) {
        linked.push({ project, item });
      }
    },
  );
  if (linked.length !== 1) {
    throw githubResponseContractError(`${context.basePath}/projectsV2`, "exactly one open linked Project");
  }
  return linked[0];
}

function isStatusNamed(field) {
  return typeof field?.name === "string" && field.name.toLowerCase() === "status";
}

function statusFieldIdOf(projectPath, commandRunner) {
  const fieldsEndpoint = `${projectPath}/fields?per_page=100`;
  const statusFields = ghJsonArrayPages(fieldsEndpoint, commandRunner).filter(isStatusNamed);
  if (statusFields.length !== 1 || !isPresent(statusFields[0].id)) {
    throw githubResponseError(fieldsEndpoint, "exactly one Status field");
  }
  return statusFields[0].id;
}

function itemStatusName(context, project, item) {
  const projectPath = `${context.basePath}/projectsV2/${project.number}`;
  const statusFieldId = statusFieldIdOf(projectPath, context.commandRunner);
  projectItemId(item, `${projectPath}/items?per_page=100`);
  const itemEndpoint = `${projectPath}/items/${item.id}?fields=${statusFieldId}`;
  const { data } = ghJson(["api", itemEndpoint], [0], context.commandRunner);
  validateProjectItemReadback({ item: data, expected: item }, context.issue, itemEndpoint);
  return projectStatusName(data, statusFieldId, itemEndpoint);
}

// The Status of one issue in a Project the caller already resolved ({ownerLogin, number}): null when the
// issue's complete Project item relation holds no item in that Project, a contract error when it holds
// several or the item has no Status. The relation comes from one GraphQL query on the issue, never from
// the REST items list, whose pages are unstable. Any failed or incomplete read throws.
export function readIssueStatusInProject({ ownerLogin, number }, repository, issueNumber, commandRunner) {
  const sameProject = (item) =>
    item.number === number && item.ownerLogin.toLowerCase() === String(ownerLogin).toLowerCase();
  const matching = readIssueProjectItems(repository, issueNumber, commandRunner).filter(sameProject);
  if (matching.length > 1) {
    throw githubResponseContractError(ISSUE_PROJECT_ITEMS_READ, "exactly one item of the issue in the Project");
  }
  if (matching.length === 0) {
    return null;
  }
  if (matching[0].status === null) {
    throw githubResponseContractError(ISSUE_PROJECT_ITEMS_READ, "exactly one non-blank Status field/value");
  }
  return matching[0].status;
}

// The Status of one issue in the one open Project that holds exactly one item for it. An item whose
// repository cannot be read stops the read, because it could be the issue's own item. It lists REST
// Project items, whose pages are unstable, and that is safe only because it fails closed: a short or
// empty page leaves no linked Project, which is a thrown contract error and never a "not in project"
// answer. Its callers (complete-pr's issue confirmation and merged recovery) treat a throw as a stop.
export function readIssueProjectStatuses(repository, issueNumber, commandRunner) {
  const owner = ownerOf(repository);
  const { basePath, projects } = listOwnedProjects(owner, commandRunner);
  const context = { basePath, issue: { repository, number: issueNumber }, commandRunner };
  const { project, item } = singleLinkedProject(context, projects);
  return [itemStatusName(context, project, item)];
}
