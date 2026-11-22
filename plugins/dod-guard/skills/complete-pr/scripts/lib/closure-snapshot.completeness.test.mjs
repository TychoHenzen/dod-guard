// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { ENDPOINT } from "./closure-snapshot.test-support.mjs";
import { failedAt } from "./fixtures/closure-snapshot-cli.mjs";
import { valuePages } from "./fixtures/closure-snapshot-pages.mjs";
import { buildFailure, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { ok } from "./fixtures/rest-shapes.mjs";

const INCOMPLETE = /item list is incomplete: read \d+, Project reports \d+/u;

function assertIncompleteItems(error) {
  assert.ok(error, "the build should have failed");
  assert.ok(error.message.startsWith(failedAt(ENDPOINT.values(2))), error.message);
  assert.match(error.message, INCOMPLETE);
}

test("a lost items page names the items endpoint and both counts", () => {
  assertIncompleteItems(buildFailure(fixtureRoutes("short-items-page")));
});

test("an empty items list against a positive count is incomplete", () => {
  const routes = { ...fixtureRoutes(), [ENDPOINT.values(2)]: ok([[]]) };
  assertIncompleteItems(buildFailure(routes));
});

test("a list longer than the Project count is incomplete", () => {
  const pages = [...valuePages(), ...valuePages()];
  const routes = { ...fixtureRoutes(), [ENDPOINT.values(2)]: ok(pages) };
  assertIncompleteItems(buildFailure(routes));
});
