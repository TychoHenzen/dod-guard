// The one rule for which GitHub Project a repository belongs to: the open
// Project explicitly linked to it, found by one read with no fallback to the
// owner's Project list or to item membership. linked-project-read.mjs owns the
// request and linked-project-response.mjs the classification; this module
// makes the read through an injected runner in gh-runner's convention, so it
// never starts gh itself.
import { LinkedProjectError, linkedProjectReadArgs } from "./linked-project-read.mjs";
import { classifyLinkedProjects } from "./linked-project-response.mjs";
import { isRepositoryName } from "./repository-identity.mjs";

// gh api graphql exits 1 when the response carries an errors array, and still
// prints it on stdout.
const GRAPHQL_ERROR_EXIT = 1;

function messageOf(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// "none", or the count and numbers, for the stop text the closure snapshot
// keeps.
function describeLinkedProjects(projects) {
  if (projects.length === 0) {
    return "none";
  }
  const numbers = projects.map(({ number }) => `#${number}`).join(", ");
  return `${projects.length} (${numbers})`;
}

function responseOf(result) {
  try {
    return JSON.parse(String(result?.stdout ?? ""));
  } catch (error) {
    if (result?.status === 0) {
      throw new LinkedProjectError("did not return JSON", { cause: error });
    }
    return null;
  }
}

function outputText(value) {
  return String(value ?? "").trim();
}

function failureDetail(result) {
  const text = outputText(result?.stderr) || outputText(result?.stdout);
  if (text) {
    return text;
  }
  return `gh exited with ${result?.status}`;
}

function runLinkedProjectRead(repository, runner) {
  try {
    return runner(linkedProjectReadArgs(repository), [0, GRAPHQL_ERROR_EXIT]);
  } catch (error) {
    const detail = `gh failed: ${messageOf(error)}`;
    throw new LinkedProjectError(detail, { cause: error });
  }
}

function carriesGraphqlErrors(result, response) {
  const failed = result?.status === GRAPHQL_ERROR_EXIT;
  return failed && Array.isArray(response?.errors);
}

// The one read. An exit 1 that carries GraphQL errors on stdout is reported as
// those errors; any other failure is a gh failure. Both throw, because only a
// complete answer can be classified.
function resolveLinkedProject(repository, runner) {
  if (!isRepositoryName(repository)) {
    const got = JSON.stringify(repository);
    throw new LinkedProjectError(`repository must be owner/name, got ${got}`);
  }
  const result = runLinkedProjectRead(repository, runner);
  const response = responseOf(result);
  if (result?.status !== 0 && !carriesGraphqlErrors(result, response)) {
    throw new LinkedProjectError(`gh failed: ${failureDetail(result)}`);
  }
  return { repository, ...classifyLinkedProjects(response) };
}

export { describeLinkedProjects, resolveLinkedProject };
