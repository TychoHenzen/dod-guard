import { describeLinkedProjects, resolveLinkedProject } from "../../../../lib/linked-project.mjs";
import { LINKED_PROJECT_READ, LinkedProjectError } from "../../../../lib/linked-project-read.mjs";
import { sameRepository } from "./project-reads.mjs";
import { readFailure, SnapshotReadError } from "./snapshot-failure.mjs";
import { readJson } from "./snapshot-runner.mjs";
import { isObject, nonBlank } from "./snapshot-values.mjs";

const EXPECTED_ONE_PROJECT = "expected exactly one open linked Project, found";

function isRepositoryNamed(data, repository) {
  return isObject(data) && sameRepository(data.full_name, repository);
}

// The open Project explicitly linked to the repository, by the same rule and
// read as step 3. A read failure the runner threw passes through unchanged so
// it is named once; a contract failure or a count other than one is a read
// failure of the GraphQL read.
export function snapshotProject(read, repository) {
  let resolution;
  try {
    resolution = resolveLinkedProject(repository, read);
  } catch (error) {
    if (error?.cause instanceof SnapshotReadError) {
      throw error.cause;
    }
    if (error instanceof LinkedProjectError) {
      throw readFailure(error.read, error.detail, error);
    }
    throw error;
  }
  if (resolution.outcome !== "resolved") {
    const found = describeLinkedProjects(resolution.projects);
    throw readFailure(LINKED_PROJECT_READ, `${EXPECTED_ONE_PROJECT} ${found}`);
  }
  const [project] = resolution.projects;
  return { basePath: project.basePath, project };
}

export function readRepository(read, repository) {
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

// ASSUMPTION: project.owner stays the repository owner, as before, while
// basePath comes from the Project owner the link names. They are the same
// login on every live repository today, and closure apply hands this field to
// project-status.mjs, which builds users/<owner> paths from it, so changing
// it belongs to its own change.
export function projectRecord(repositoryName, project, fields) {
  const [owner] = repositoryName.split("/");
  const { statusFieldId, doneOptionId } = fields;
  return { owner, number: project.number, statusFieldId, doneOptionId };
}

export function itemsEndpoint(basePath, number, fieldIds) {
  return `${basePath}/projectsV2/${number}/items?per_page=100&fields=${fieldIds.join(",")}`;
}
