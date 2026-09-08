import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nonMergeGitLogArguments,
  parseNonMergeGitLog,
  resolveRenameActivities,
} from "./git-analyzer.js";
import { temporaryRepository } from "./git-analyzer.test-support.js";

async function successiveRenameActivity() {
  const repository = await temporaryRepository();
  await repository.writeSourceFile("src/first.ts", "export const value = 1;\n");
  await repository.recordCommit("create", new Date("2025-01-01T00:00:00.000Z"));
  await repository.git(["mv", "src/first.ts", "src/middle.ts"]);
  await repository.recordCommit(
    "first rename",
    new Date("2025-01-02T00:00:00.000Z"),
  );
  await repository.git(["mv", "src/middle.ts", "src/final.ts"]);
  await repository.recordCommit(
    "second rename",
    new Date("2025-01-03T00:00:00.000Z"),
  );

  return resolveRenameActivities(
    parseNonMergeGitLog(await repository.git(nonMergeGitLogArguments())),
  );
}

async function testSuccessiveRenames(): Promise<void> {
  const activities = await successiveRenameActivity();
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
}

test(
  "collapses successive Git renames into one logical file at its final path",
  testSuccessiveRenames,
);
