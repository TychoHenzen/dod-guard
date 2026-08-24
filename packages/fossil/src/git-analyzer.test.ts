import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  filterHistoryByExtensions,
  nonMergeGitLogArguments,
  parseNonMergeGitLog,
  resolveRenameActivities,
  splitAtChangePoint,
  splitTemporalClusters,
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

// covers: fossil/burst-analysis :: Temporal burst detection :: Gap above threshold splits commits
test("splits chronological commits when an adjacent gap is one millisecond above the threshold", () => {
  const commits = [
    { hash: "first", committerTimestampMs: 1_000, changes: [] },
    { hash: "second", committerTimestampMs: 1_500, changes: [] },
    { hash: "third", committerTimestampMs: 2_001, changes: [] },
  ];

  const clusters = splitTemporalClusters(commits, 500);

  assert.deepEqual(
    clusters.map((cluster) => cluster.map((commit) => commit.hash)),
    [["first", "second"], ["third"]],
  );
});

// covers: fossil/burst-analysis :: Temporal burst detection :: Gap at threshold keeps commits together
test("keeps chronological commits together when their adjacent gap equals the threshold", () => {
  const clusters = splitTemporalClusters(
    [
      { hash: "first", committerTimestampMs: 1_000, changes: [] },
      { hash: "second", committerTimestampMs: 1_500, changes: [] },
    ],
    500,
  );

  assert.deepEqual(
    clusters.map((cluster) => cluster.map((commit) => commit.hash)),
    [["first", "second"]],
  );
});

// covers: fossil/burst-analysis :: File-set change-point detection :: Disjoint close work becomes separate bursts
test("splits close disjoint work when inverse-frequency weighting suppresses the shared file", () => {
  const hour = 60 * 60 * 1_000;
  const paths = [
    ["shared.ts", "left-a.ts"],
    ["shared.ts", "left-b.ts"],
    ["shared.ts", "left-c.ts"],
    ["shared.ts", "left-a.ts"],
    ["shared.ts", "left-b.ts"],
    ["shared.ts", "right-a.ts"],
    ["shared.ts", "right-b.ts"],
    ["shared.ts", "right-c.ts"],
    ["shared.ts", "right-a.ts"],
    ["shared.ts", "right-b.ts"],
  ];
  const commits = paths.map((changedPaths, index) => ({
    hash: `${index}`,
    committerTimestampMs: index < 5 ? index * hour : (index + 3) * hour,
    changes: changedPaths.map((path) => ({ status: "modified" as const, path })),
  }));
  const leftFiles = new Set(commits.slice(0, 5).flatMap((commit) => commit.changes.map((change) => change.path)));
  const rightFiles = new Set(commits.slice(5).flatMap((commit) => commit.changes.map((change) => change.path)));
  const unweightedSimilarity =
    [...leftFiles].filter((path) => rightFiles.has(path)).length / new Set([...leftFiles, ...rightFiles]).size;

  assert.equal(unweightedSimilarity, 1 / 7);
  assert.ok(unweightedSimilarity > 0.1);

  const partitions = splitAtChangePoint(commits);

  assert.deepEqual(
    partitions.map((partition) => partition.map((commit) => commit.hash)),
    [
      ["0", "1", "2", "3", "4"],
      ["5", "6", "7", "8", "9"],
    ],
  );
});
