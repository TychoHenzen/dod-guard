import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterHistoryByExtensions,
  normalizeExtensions,
} from "./git-analyzer.js";

test(
  "filters whole rename identities without discarding cross-extension source " +
    "history",
  () => {
    const fullHistory = [
      {
        hash: "one",
        committerTimestampMs: 1_000,
        changes: [{ status: "added" as const, path: "src/candidate.ts" }],
      },
      {
        hash: "two",
        committerTimestampMs: 2_000,
        changes: [
          {
            status: "renamed" as const,
            previousPath: "src/candidate.ts",
            path: "docs/candidate.md",
          },
        ],
      },
      {
        hash: "three",
        committerTimestampMs: 3_000,
        changes: [{ status: "added" as const, path: "src/live.js" }],
      },
    ];

    const typescriptHistory = filterHistoryByExtensions(
      fullHistory,
      new Set([".ts"]),
    );
    const markdownHistory = filterHistoryByExtensions(
      fullHistory,
      new Set([".md"]),
    );

    assert.deepEqual(typescriptHistory, []);
    assert.deepEqual(markdownHistory, [
      {
        hash: "one",
        committerTimestampMs: 1_000,
        changes: [{ status: "added", path: "src/candidate.ts" }],
      },
      {
        hash: "two",
        committerTimestampMs: 2_000,
        changes: [
          {
            status: "renamed",
            previousPath: "src/candidate.ts",
            path: "docs/candidate.md",
          },
        ],
      },
    ]);
    assert.deepEqual(
      fullHistory.flatMap((commit) =>
        commit.changes.map((change) => change.path),
      ),
      ["src/candidate.ts", "docs/candidate.md", "src/live.js"],
    );
    assert.deepEqual(
      filterHistoryByExtensions(fullHistory, new Set()),
      fullHistory,
    );
  },
);

test(
  "normalizes extension dots and case before case-insensitive path matching",
  () => {
  const extensions = normalizeExtensions(["ts", ".TS", "Js", ".js"]);
  const history = [
    {
      hash: "typescript",
      committerTimestampMs: 1_000,
      changes: [{ status: "added" as const, path: "src/Feature.Ts" }],
    },
    {
      hash: "markdown",
      committerTimestampMs: 2_000,
      changes: [{ status: "added" as const, path: "docs/README.MD" }],
    },
  ];

  assert.deepEqual(extensions, [".ts", ".js"]);
  assert.deepEqual(filterHistoryByExtensions(history, new Set(extensions)), [
    history[0],
  ]);
});
