import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  filterHistoryByExtensions,
  nonMergeGitLogArguments,
  parseNonMergeGitLog,
  resolveRenameActivities,
} from "./git-analyzer.js";
import { createTemporaryRepository, type TemporaryRepository } from "./testing/fixtures.js";

const repositories: TemporaryRepository[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.cleanup()));
});

async function temporaryRepository(): Promise<TemporaryRepository> {
  const repository = await createTemporaryRepository();
  repositories.push(repository);
  return repository;
}

// covers: fossil/burst-analysis :: History activity model :: Merge commits do not add activity
test("omits merge-only activity while retaining reachable non-merge commits", async () => {
  const repository = await temporaryRepository();
  await repository.writeSourceFile("src/base.ts", "export const base = true;\n");
  await repository.recordCommit("base", new Date("2025-01-01T00:00:00.000Z"));
  const primaryBranch = (await repository.git(["branch", "--show-current"])).trim();

  await repository.git(["checkout", "--quiet", "-b", "feature"]);
  await repository.writeSourceFile("src/feature.ts", "export const feature = true;\n");
  await repository.recordCommit("feature", new Date("2025-01-02T00:00:00.000Z"));

  await repository.git(["checkout", "--quiet", primaryBranch]);
  await repository.writeSourceFile("src/main.ts", "export const main = true;\n");
  await repository.recordCommit("main", new Date("2025-01-03T00:00:00.000Z"));
  await repository.git(["merge", "--no-ff", "--no-commit", "feature"]);
  await repository.writeSourceFile("src/merge-only.ts", "export const mergeOnly = true;\n");
  await repository.git(["add", "--all"]);
  await repository.git(["commit", "--quiet", "--message", "merge feature"]);

  const commits = parseNonMergeGitLog(await repository.git(nonMergeGitLogArguments()));
  const activePaths = commits.flatMap((commit) => commit.changes.map((change) => change.path));

  assert.equal(commits.length, 3);
  assert.deepEqual(activePaths.sort(), ["src/base.ts", "src/feature.ts", "src/main.ts"]);
  assert.ok(!activePaths.includes("src/merge-only.ts"));
});

// covers: fossil/burst-analysis :: History activity model :: Rename preserves logical identity
test("collapses successive Git renames into one logical file at its final path", async () => {
  const repository = await temporaryRepository();
  await repository.writeSourceFile("src/first.ts", "export const value = 1;\n");
  await repository.recordCommit("create", new Date("2025-01-01T00:00:00.000Z"));
  await repository.git(["mv", "src/first.ts", "src/middle.ts"]);
  await repository.recordCommit("first rename", new Date("2025-01-02T00:00:00.000Z"));
  await repository.git(["mv", "src/middle.ts", "src/final.ts"]);
  await repository.recordCommit("second rename", new Date("2025-01-03T00:00:00.000Z"));

  const activities = resolveRenameActivities(parseNonMergeGitLog(await repository.git(nonMergeGitLogArguments())));

  assert.equal(activities.length, 1);
  assert.deepEqual(activities[0], {
    identity: "src/first.ts",
    currentPath: "src/final.ts",
    paths: ["src/first.ts", "src/middle.ts", "src/final.ts"],
    firstCommitTimestampMs: Date.parse("2025-01-01T00:00:00.000Z"),
    lastCommitTimestampMs: Date.parse("2025-01-03T00:00:00.000Z"),
    commitCount: 3,
    created: true,
    deleted: false,
    existsAtHead: true,
  });
});

// covers: fossil/burst-analysis :: History activity model :: Extension filter limits history
test("filters whole rename identities without discarding cross-extension source history", () => {
  const fullHistory = [
    {
      hash: "one",
      committerTimestampMs: 1_000,
      changes: [{ status: "added" as const, path: "src/candidate.ts" }],
    },
    {
      hash: "two",
      committerTimestampMs: 2_000,
      changes: [{ status: "renamed" as const, previousPath: "src/candidate.ts", path: "docs/candidate.md" }],
    },
    {
      hash: "three",
      committerTimestampMs: 3_000,
      changes: [{ status: "added" as const, path: "src/live.js" }],
    },
  ];

  const typescriptHistory = filterHistoryByExtensions(fullHistory, new Set([".ts"]));
  const markdownHistory = filterHistoryByExtensions(fullHistory, new Set([".md"]));

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
      changes: [{ status: "renamed", previousPath: "src/candidate.ts", path: "docs/candidate.md" }],
    },
  ]);
  assert.deepEqual(
    fullHistory.flatMap((commit) => commit.changes.map((change) => change.path)),
    ["src/candidate.ts", "docs/candidate.md", "src/live.js"],
  );
  assert.deepEqual(filterHistoryByExtensions(fullHistory, new Set()), fullHistory);
});
