import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECK_IGNORE_ARGUMENTS,
  IGNORED_DISCOVERY_ARGUMENTS,
  oldIgnoredWorkspaceCandidates,
  oldUntrackedWorkspaceCandidates,
  parseNulDelimitedPaths,
  parseVerboseCheckIgnore,
  UNTRACKED_DISCOVERY_ARGUMENTS,
} from "./workspace-debris.js";

// covers: fossil/workspace-debris :: Workspace file discovery :: Old untracked file is eligible
test("parses NUL-delimited untracked paths and selects an old regular file", () => {
  const unusualPath = "scratch/line\nbreak.ts";
  assert.deepEqual(UNTRACKED_DISCOVERY_ARGUMENTS, ["ls-files", "-z", "--others", "--exclude-standard"]);
  assert.deepEqual(parseNulDelimitedPaths(`scratch/old.ts\0${unusualPath}\0`), ["scratch/old.ts", unusualPath]);

  const candidates = oldUntrackedWorkspaceCandidates(
    [
      { path: "scratch/old.ts", isRegularFile: true, modifiedTimestampMs: 0 },
      { path: "scratch/directory", isRegularFile: false, modifiedTimestampMs: 0 },
    ],
    10 * 24 * 60 * 60 * 1_000,
    7,
  );

  assert.deepEqual(candidates, [{ path: "scratch/old.ts", kind: "untracked", modifiedTimestampMs: 0 }]);
});

// covers: fossil/workspace-debris :: Workspace file discovery :: Old ignored file is eligible
test("retains NUL-delimited ignore rule provenance for an old ignored regular file", () => {
  assert.deepEqual(IGNORED_DISCOVERY_ARGUMENTS, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"]);
  assert.deepEqual(CHECK_IGNORE_ARGUMENTS, ["check-ignore", "-z", "-v", "--stdin"]);
  const provenance = parseVerboseCheckIgnore(
    ".gitignore\0" +
      "4\0" +
      "*.cache\0" +
      "scratch/old.cache\0" +
      "C:/global/excludes\0" +
      "1\0" +
      "*.tmp\0" +
      "scratch/global.tmp\0",
    "C:/global/excludes",
  );
  assert.deepEqual(provenance, [
    { path: "scratch/old.cache", rule: "*.cache", source: "repository" },
    { path: "scratch/global.tmp", rule: "*.tmp", source: "global-exclude" },
  ]);

  const candidates = oldIgnoredWorkspaceCandidates(
    [{ path: "scratch/old.cache", isRegularFile: true, modifiedTimestampMs: 0 }],
    provenance,
    10 * 24 * 60 * 60 * 1_000,
    7,
  );
  assert.deepEqual(candidates, [
    {
      path: "scratch/old.cache",
      kind: "ignored",
      modifiedTimestampMs: 0,
      ignore: { rule: "*.cache", source: "repository" },
    },
  ]);
});

// covers: fossil/workspace-debris :: Workspace file discovery :: Recent workspace file is omitted
test("omits recent untracked and ignored workspace files", () => {
  const now = 10 * 24 * 60 * 60 * 1_000;
  const recentTimestampMs = now - 24 * 60 * 60 * 1_000;

  assert.deepEqual(
    oldUntrackedWorkspaceCandidates(
      [{ path: "scratch/recent.ts", isRegularFile: true, modifiedTimestampMs: recentTimestampMs }],
      now,
      7,
    ),
    [],
  );
  assert.deepEqual(
    oldIgnoredWorkspaceCandidates(
      [{ path: "scratch/recent.cache", isRegularFile: true, modifiedTimestampMs: recentTimestampMs }],
      [{ path: "scratch/recent.cache", rule: "*.cache", source: "repository" }],
      now,
      7,
    ),
    [],
  );
});
