import {
  API_ISSUE_URL,
  API_REPOSITORY_URL,
  isRepositoryName,
  urlReference,
  urlRepository,
} from "../../../../lib/repository-identity.mjs";
import { siteFailure } from "./snapshot-failure.mjs";
import { nonBlank, positiveInteger, present } from "./snapshot-values.mjs";

// Whether a URL names a repository through one of the two API patterns that carry one: a repository
// URL, or an issue URL, which names the repository its issue is in.
function namesRepository(url) {
  return urlRepository(url, API_REPOSITORY_URL) !== null || urlRepository(url, API_ISSUE_URL) !== null;
}

function bareOrFullName(value) {
  // ASSUMPTION: the Repository field may also carry the bare owner/name string, which the plan does
  // not name. Reading it the same way is safer than failing a live build over the spelling.
  if (typeof value === "string") {
    return value;
  }
  return value?.full_name;
}

function namesRepositoryUrls(value) {
  return [value?.repository_url, value?.url].filter(present).every(namesRepository);
}

// ASSUMPTION: the Parent issue value names its issue by an issue URL in repository_url or url; when
// only a repository URL is present, the value's own number names the issue.
function parentFromRepositoryUrl(value) {
  const repository = urlRepository(value?.repository_url, API_REPOSITORY_URL);
  if (repository !== null && positiveInteger(value?.number)) {
    return { repository, number: value.number };
  }
  return null;
}

function parentReference(value) {
  return (
    urlReference(value?.repository_url, API_ISSUE_URL) ??
    urlReference(value?.url, API_ISSUE_URL) ??
    parentFromRepositoryUrl(value)
  );
}

// A field's value from one item. Absent means the item holds no value for that field, which the
// snapshot records as null; a field listed twice is a failed read.
export function fieldValue(fields, id, site) {
  if (!Array.isArray(fields)) {
    return null;
  }
  const matches = fields.filter((field) => String(field?.id) === String(id));
  if (matches.length > 1) {
    throw siteFailure(site, `repeats field ${id}`);
  }
  return matches[0]?.value ?? null;
}

export function contentNumber(content, site) {
  if (content.number === undefined || content.number === null) {
    return null;
  }
  if (!positiveInteger(content.number)) {
    throw siteFailure(site, "has a content number that is not a positive integer");
  }
  return content.number;
}

export function repositoryValue(value, site) {
  if (value === null) {
    return null;
  }
  const name = bareOrFullName(value);
  if (!nonBlank(name)) {
    throw siteFailure(site, "has a Repository value with no full_name");
  }
  if (!isRepositoryName(name)) {
    throw siteFailure(site, "has a Repository value that names no repository");
  }
  return name;
}

// ASSUMPTION: the Parent issue value's URLs are API URLs, as every other value the snapshot reads is,
// so a present URL that names no repository fails the read rather than being skipped for the other URL.
export function parentValue(value, site) {
  if (value === null) {
    return null;
  }
  if (!namesRepositoryUrls(value)) {
    throw siteFailure(site, "has a Parent issue URL that names no repository");
  }
  const parent = parentReference(value);
  if (parent === null) {
    throw siteFailure(site, "has a Parent issue value that names no issue");
  }
  return parent;
}
