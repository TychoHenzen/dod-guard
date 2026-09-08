import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nonMergeGitLogArguments,
  parseNonMergeGitLog,
} from "./git-analyzer.js";
import { temporaryRepository } from "./git-analyzer.test-support.js";

async function createBaseCommit(
  repository: Awaited<ReturnType<typeof temporaryRepository>>,
): Promise<string> {
  await repository.writeSourceFile(
    "src/base.ts",
    "export const base = true;\n",
  );
  await repository.recordCommit("base", new Date("2025-01-01T00:00:00.000Z"));
  return (await repository.git(["branch", "--show-current"])).trim();
}

async function createFeatureCommit(
  repository: Awaited<ReturnType<typeof temporaryRepository>>,
): Promise<void> {
  await repository.git(["checkout", "--quiet", "-b", "feature"]);
  await repository.writeSourceFile(
    "src/feature.ts",
    "export const feature = true;\n",
  );
  await repository.recordCommit(
    "feature",
    new Date("2025-01-02T00:00:00.000Z"),
  );
}

async function createMergeCommit(
  repository: Awaited<ReturnType<typeof temporaryRepository>>,
  primaryBranch: string,
): Promise<void> {
  await repository.git(["checkout", "--quiet", primaryBranch]);
  await repository.writeSourceFile(
    "src/main.ts",
    "export const main = true;\n",
  );
  await repository.recordCommit("main", new Date("2025-01-03T00:00:00.000Z"));
  await repository.git(["merge", "--no-ff", "--no-commit", "feature"]);
  await repository.writeSourceFile(
    "src/merge-only.ts",
    "export const mergeOnly = true;\n",
  );
  await repository.git(["add", "--all"]);
  await repository.git(["commit", "--quiet", "--message", "merge feature"]);
}

async function mergeOnlyCommits() {
  const repository = await temporaryRepository();
  const primaryBranch = await createBaseCommit(repository);
  await createFeatureCommit(repository);
  await createMergeCommit(repository, primaryBranch);
  const commits = parseNonMergeGitLog(
    await repository.git(nonMergeGitLogArguments()),
  );
  return commits;
}

async function testMergeOnlyHistory(): Promise<void> {
  const commits = await mergeOnlyCommits();
  const activePaths = commits.flatMap((commit) =>
    commit.changes.map((change) => change.path),
  );

  assert.equal(commits.length, 3);
  assert.deepEqual(activePaths.sort(), [
    "src/base.ts",
    "src/feature.ts",
    "src/main.ts",
  ]);
  assert.ok(!activePaths.includes("src/merge-only.ts"));
}

test(
  "omits merge-only activity while retaining reachable non-merge commits",
  testMergeOnlyHistory,
);
