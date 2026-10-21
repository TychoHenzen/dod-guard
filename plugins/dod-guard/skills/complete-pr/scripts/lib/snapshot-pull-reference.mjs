import { API_PULL_URL, isRepositoryName, urlReference } from "../../../../lib/repository-identity.mjs";
import { siteFailure } from "./snapshot-failure.mjs";
import { nonBlank, positiveInteger, present } from "./snapshot-values.mjs";

function baseRepository(pull, site) {
  const base = pull?.base?.repo?.full_name;
  if (present(base) && !isRepositoryName(base)) {
    throw siteFailure(site, "has a linked pull request base repository that names no repository");
  }
  return base ?? null;
}

// A linked pull request's repository is the one its API URL names. Without a URL it is the base
// repository's. A URL or base repository that is present and names no repository fails the read, so no
// other name stands in for it.
function pullRepository(pull, reference, site) {
  if (reference !== null) {
    return reference.repository;
  }
  if (present(pull?.url)) {
    throw siteFailure(site, "has a linked pull request URL that names no pull request");
  }
  return baseRepository(pull, site);
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

export function linkedPullValues(value, site) {
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw siteFailure(site, "has a Linked pull requests value that is not a list");
  }
  return value;
}

export function pullReference(pull, site) {
  const reference = urlReference(pull?.url, API_PULL_URL);
  const repository = pullRepository(pull, reference, site);
  const number = pullNumber(pull, reference);
  if (!isPullReference(repository, number)) {
    throw siteFailure(site, "has a linked pull request with no repository or number");
  }
  return { repository, number };
}
