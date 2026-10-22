// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertProjectReadError, tableRunner } from "./fixtures/project-reads-runners.mjs";
import { okResponse } from "./github-client.test-support.mjs";
import { contentRepository, readSlurpedPages, sameRepository } from "./project-reads.mjs";

test("readSlurpedPages flattens every page and names a page that is not an array", () => {
  const read = (pages) => tableRunner({ x: okResponse(pages) }).runner;
  assert.deepEqual(readSlurpedPages(read(JSON.stringify([[1], [2, 3]])), "x"), [1, 2, 3]);
  assertProjectReadError(() => readSlurpedPages(read("{"), "x"), "x", "did not return JSON");
  assertProjectReadError(
    () => readSlurpedPages(read(JSON.stringify([[1], {}])), "x"),
    "x",
    "missing page: every page must be an array",
  );
});

test("contentRepository reads full_name first, then repository_url, and null for neither", () => {
  assert.equal(contentRepository({ repository: { full_name: "o/r" }, repository_url: "ignored" }, "x"), "o/r");
  assert.equal(contentRepository({ repository_url: "https://api.github.com/repos/o/r" }, "x"), "o/r");
  assert.equal(contentRepository({}, "x"), null);
  assert.equal(contentRepository(undefined, "x"), null);
  assertProjectReadError(
    () => contentRepository({ repository: { full_name: "o" } }, "x"),
    "x",
    "content repository full_name must name a repository",
  );
  assertProjectReadError(
    () => contentRepository({ repository_url: "https://example.test/o/r" }, "x"),
    "x",
    "content repository_url must name a repository",
  );
});

test("sameRepository compares names without case and never matches a missing name", () => {
  assert.equal(sameRepository("Owner/Repo", "owner/repo"), true);
  assert.equal(sameRepository("owner/other", "owner/repo"), false);
  assert.equal(sameRepository(null, "owner/repo"), false);
});
