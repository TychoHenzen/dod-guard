import assert from "node:assert/strict";
import { test } from "node:test";
import { nonMergeGitLogArguments, parseNonMergeGitLog, sortCommitsChronologically, } from "./git-analyzer.js";
import { temporaryRepository } from "./git-analyzer.test-support.js";
test("disables external diff helpers for non-merge history output", () => {
    assert.equal(nonMergeGitLogArguments().includes("--no-ext-diff"), true);
});
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
test("orders parsed commits by UTC epoch then ordinal hash without mutating sort input", () => {
    const commits = parseNonMergeGitLog("\u001ez\u00001700000001\u0000M\u0000later.ts\u0000\u001eb\u00001700000000\u0000A\u0000second.ts\u0000\u001ea\u00001700000000\u0000A\u0000first.ts\u0000");
    const unordered = [commits[2], commits[1], commits[0]];
    assert.deepEqual(commits.map((commit) => [commit.hash, commit.committerTimestampMs, commit.changes[0].path]), [
        ["a", 1_700_000_000_000, "first.ts"],
        ["b", 1_700_000_000_000, "second.ts"],
        ["z", 1_700_000_001_000, "later.ts"],
    ]);
    assert.deepEqual(sortCommitsChronologically(unordered).map((commit) => commit.hash), ["a", "b", "z"]);
    assert.deepEqual(unordered.map((commit) => commit.hash), ["z", "b", "a"]);
});
test("preserves whitespace, newline, quote, and control-byte filenames as individual Git changes", () => {
    const paths = ["src/white space.ts", "src/line\nbreak.ts", 'src/"quoted".ts', "src/control-\u0001.ts"];
    const commits = parseNonMergeGitLog(`\u001eunusual-files\0${17_000_000_000}\0A\0${paths[0]}\0M\0${paths[1]}\0D\0${paths[2]}\0T\0${paths[3]}\0`);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].changes.length, paths.length);
    assert.deepEqual(commits[0].changes, [
        { status: "added", path: paths[0] },
        { status: "modified", path: paths[1] },
        { status: "deleted", path: paths[2] },
        { status: "type-changed", path: paths[3] },
    ]);
});
//# sourceMappingURL=git-history-parse.cases.js.map