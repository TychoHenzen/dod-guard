import assert from "node:assert/strict";
import test from "node:test";
import {
  API_ISSUE_URL,
  API_PULL_URL,
  API_RECORD_URL,
  API_REPOSITORY_URL,
  isRepositoryName,
  repositoryName,
  urlReference,
  urlRepository,
} from "./repository-identity.mjs";

const REPO = "TychoHenzen/dod-guard";
const API = `https://api.github.com/repos/${REPO}`;

// Each pattern with a valid API URL it captures the owner/name from.
const VALID = [
  [API_REPOSITORY_URL, API, REPO],
  [API_ISSUE_URL, `${API}/issues/7`, REPO],
  [API_PULL_URL, `${API}/pulls/7`, REPO],
  [API_RECORD_URL, `${API}/issues/7`, REPO],
  [API_RECORD_URL, `${API}/pulls/7`, REPO],
];

// Each pattern with a malformed URL it must refuse: a rejected name, a wrong segment, or no string.
const MALFORMED = [
  [API_REPOSITORY_URL, "https://api.github.com/repos/TychoHenzen/Deep+Seek"],
  [API_REPOSITORY_URL, "https://api.github.com/repos/a/b/c"],
  [API_REPOSITORY_URL, "https://github.com/TychoHenzen/dod-guard"],
  [API_ISSUE_URL, `${API}/issues/x`],
  [API_ISSUE_URL, `${API}/pulls/7`],
  [API_PULL_URL, "https://api.github.com/repos/TychoHenzen/Deep+Seek/pulls/7"],
  [API_RECORD_URL, `${API}/commits/7`],
  [API_REPOSITORY_URL, undefined],
  [API_PULL_URL, null],
];

test("repositoryName accepts an owner/name string, or an object that carries one", () => {
  assert.equal(repositoryName("TychoHenzen/dod-guard"), REPO);
  assert.equal(repositoryName({ full_name: REPO }), REPO);
  assert.equal(repositoryName({ nameWithOwner: REPO }), REPO);
  assert.equal(isRepositoryName(REPO), true);
});

test("repositoryName rejects a value that is not an owner/name", () => {
  for (const value of ["TychoHenzen/Deep+Seek", "a/b/c", "", 42, { full_name: "TychoHenzen/Deep+Seek" }]) {
    assert.equal(repositoryName(value), null, JSON.stringify(value));
    assert.equal(isRepositoryName(value), false, JSON.stringify(value));
  }
});

test("each URL pattern captures the owner/name from a valid API URL", () => {
  for (const [pattern, url, repository] of VALID) {
    assert.equal(urlRepository(url, pattern), repository, url);
  }
});

test("each URL pattern returns null for a malformed URL, and for a value that is not a string", () => {
  for (const [pattern, url] of MALFORMED) {
    assert.equal(urlRepository(url, pattern), null, String(url));
    assert.equal(urlReference(url, pattern), null, String(url));
  }
});

test("the issue and pull patterns capture the number as well", () => {
  assert.deepEqual(urlReference(`${API}/issues/7`, API_ISSUE_URL), { repository: REPO, number: 7 });
  assert.deepEqual(urlReference(`${API}/pulls/7`, API_PULL_URL), { repository: REPO, number: 7 });
});
