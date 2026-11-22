// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { SnapshotReadError } from "./snapshot-failure.mjs";
import { requireCompleteItems } from "./snapshot-item-count.mjs";

const ENDPOINT = "projects/2/items?per_page=100";
const INCOMPLETE = /item list is incomplete: read \d+, Project reports \d+/u;
const PREFIX = `closure snapshot read failed: ${ENDPOINT}: `;
const ARCHIVED = { archived_at: "2026-01-01T00:00:00Z" };

function rowsOf(count) {
  return Array.from({ length: count }, () => ({}));
}

test("an item list that differs from the Project count is incomplete", () => {
  for (const [read, reports] of [
    [2, 3],
    [3, 2],
    [0, 5],
  ]) {
    assert.throws(
      () => requireCompleteItems(rowsOf(read), { number: 2, itemCount: reports }, ENDPOINT),
      (error) =>
        error instanceof SnapshotReadError && INCOMPLETE.test(error.message) && error.message.startsWith(PREFIX),
    );
  }
});

test("the non-archived row count also satisfies the Project count", () => {
  const rows = [{}, ARCHIVED];
  requireCompleteItems(rows, { number: 2, itemCount: 1 }, ENDPOINT);
  requireCompleteItems(rows, { number: 2, itemCount: 2 }, ENDPOINT);
  assert.throws(() => requireCompleteItems(rows, { number: 2, itemCount: 3 }, ENDPOINT), INCOMPLETE);
});

test("a Project without items.totalCount is a read failure of the linked-Project read", () => {
  assert.throws(
    () => requireCompleteItems([], { number: 2, itemCount: null }, ENDPOINT),
    (error) =>
      error instanceof SnapshotReadError &&
      error.message.startsWith("closure snapshot read failed: graphql repository.projectsV2:"),
  );
});
