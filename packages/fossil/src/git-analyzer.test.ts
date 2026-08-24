import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { nonMergeGitLogArguments, parseNonMergeGitLog } from "./git-analyzer.js";
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
