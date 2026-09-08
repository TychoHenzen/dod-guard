import assert from "node:assert/strict";
import { test } from "node:test";
import { FossilAnalysisError } from "./analysis-error.js";
import { filterHistoryByExtensions } from "./git-analyzer.js";

test(
  "accepts exactly one hundred thousand included commits and rejects the " +
    "next one",
  () => {
    const commit = { hash: "included", committerTimestampMs: 0, changes: [] };
    assert.equal(
      filterHistoryByExtensions(
        Array.from({ length: 100_000 }, () => commit),
        new Set(),
      ).length,
      100_000,
    );
    assert.throws(
      () =>
        filterHistoryByExtensions(
          Array.from({ length: 100_001 }, () => commit),
          new Set(),
        ),
      (error: unknown) =>
        error instanceof FossilAnalysisError &&
        error.code === "resource_limit" &&
        error.message === "Included commit limit exceeded.",
    );
  },
);
