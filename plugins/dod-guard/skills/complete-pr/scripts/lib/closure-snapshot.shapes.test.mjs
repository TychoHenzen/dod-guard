import assert from "node:assert/strict";
import test from "node:test";
import { ENDPOINT } from "./closure-snapshot.test-support.mjs";
import { ERROR_PREFIX, MISSING_BODY } from "./fixtures/closure-snapshot-cli.mjs";
import { REJECTED_NAMES } from "./fixtures/closure-snapshot-pages.mjs";
import { buildFailure, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { REPO } from "./fixtures/rest-shapes.mjs";

test("AC-05: an issue whose content omits body stops the build and names the issue", () => {
  const error = buildFailure(fixtureRoutes("missing-body"));
  assert.ok(error, "the build should have failed");
  assert.match(error.message, ERROR_PREFIX);
  assert.ok(error.message.includes(`repos/${REPO}/issues/11`), error.message);
  assert.match(error.message, MISSING_BODY);
});

test("AC-05: a repository name the shared pattern rejects stops the build and names the items endpoint", () => {
  for (const variant of REJECTED_NAMES) {
    const error = buildFailure(fixtureRoutes(variant));
    assert.ok(error, `${variant}: the build should have failed`);
    assert.match(error.message, ERROR_PREFIX);
    assert.ok(error.message.includes(ENDPOINT.values(2)), `${variant}: ${error.message}`);
  }
});

test("AC-06: a Status whose spellings disagree stops the build and names the item", () => {
  const error = buildFailure(fixtureRoutes("contradictory-status"));
  assert.ok(error, "the build should have failed");
  assert.match(error.message, ERROR_PREFIX);
  assert.ok(error.message.includes("PVTI_t11"), error.message);
  assert.ok(error.message.includes(ENDPOINT.values(2)), error.message);
});

test("AC-06: a blank Status name stops the build and names the item", () => {
  const error = buildFailure(fixtureRoutes("blank-status"));
  assert.ok(error, "the build should have failed");
  assert.ok(error.message.includes("PVTI_t11"), error.message);
  assert.ok(error.message.includes(ENDPOINT.values(2)), error.message);
});

test("a non-object entry on an items page still fails item validation", () => {
  const error = buildFailure(fixtureRoutes("non-object-item"));
  assert.ok(error, "the build should have failed");
  assert.ok(error.message.includes("every item must carry a node_id"), error.message);
  assert.ok(error.message.includes(ENDPOINT.values(2)), error.message);
});
