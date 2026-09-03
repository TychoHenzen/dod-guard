import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { FossilAnalysisError } from "./analysis-error.js";
import { assembleClosedBursts, emptyHistoryWarnings, filterHistoryByExtensions, futureCommitWarnings, nonMergeGitLogArguments, normalizeExtensions, parseNonMergeGitLog, resolveRenameActivities, retainClosedTemporalClusters, retainQualifiedClosedClusters, selectAbsoluteSurvivors, selectDeletedNonSurvivorPaths, selectFossilCandidates, selectRelativeSurvivors, selectSurvivors, shallowHistoryWarnings, shallowRepositoryArguments, sortCommitsChronologically, sparseCheckoutArguments, sparseCheckoutWarnings, splitAtChangePoint, splitTemporalClusters, } from "./git-analyzer.js";
import { createTemporaryRepository } from "./testing/fixtures.js";
const repositories = [];
afterEach(async () => {
    await Promise.all(repositories.splice(0).map((repository) => repository.cleanup()));
});
async function temporaryRepository() {
    const repository = await createTemporaryRepository();
    repositories.push(repository);
    return repository;
}
function changePointCommits(fileSets, gapsBefore) {
    let timestamp = 0;
    return fileSets.map((paths, index) => {
        if (index > 0)
            timestamp += gapsBefore.get(index) ?? 60 * 60 * 1_000;
        return {
            hash: `point-${index}`,
            committerTimestampMs: timestamp,
            changes: paths.map((path) => ({ status: "modified", path })),
        };
    });
}
test("accepts exactly one hundred thousand included commits and rejects the next one", () => {
    const commit = { hash: "included", committerTimestampMs: 0, changes: [] };
    assert.equal(filterHistoryByExtensions(Array.from({ length: 100_000 }, () => commit), new Set()).length, 100_000);
    assert.throws(() => filterHistoryByExtensions(Array.from({ length: 100_001 }, () => commit), new Set()), (error) => error instanceof FossilAnalysisError &&
        error.code === "resource_limit" &&
        error.message === "Included commit limit exceeded.");
});
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
test("reports future commits and leaves their temporal cluster unfinished", () => {
    const analysisTimestampMs = 10_000;
    const cluster = [
        { hash: "past", committerTimestampMs: 8_000, changes: [{ status: "modified", path: "past.ts" }] },
        {
            hash: "z-future",
            committerTimestampMs: 10_001,
            changes: [{ status: "modified", path: "future-z.ts" }],
        },
        {
            hash: "a-future",
            committerTimestampMs: 10_001,
            changes: [{ status: "modified", path: "future-a.ts" }],
        },
        { hash: "later", committerTimestampMs: 8_002, changes: [{ status: "modified", path: "later.ts" }] },
        { hash: "latest", committerTimestampMs: 8_003, changes: [{ status: "modified", path: "latest.ts" }] },
    ];
    assert.deepEqual(futureCommitWarnings(cluster, analysisTimestampMs), [
        { code: "future_commit", message: "Commit a-future has a committer timestamp after analysis time." },
        { code: "future_commit", message: "Commit z-future has a committer timestamp after analysis time." },
    ]);
    assert.deepEqual(retainClosedTemporalClusters([cluster], analysisTimestampMs, 1_000), []);
});
test("reports shallow history without treating malformed Git output as complete", () => {
    assert.deepEqual(shallowRepositoryArguments(), ["rev-parse", "--is-shallow-repository"]);
    assert.deepEqual(shallowHistoryWarnings("true\n"), [
        {
            code: "shallow_history",
            message: "Repository is shallow; burst and consolidation history may be incomplete.",
        },
    ]);
    assert.deepEqual(shallowHistoryWarnings("false\r\n"), []);
    assert.throws(() => shallowHistoryWarnings("unknown\n"), /Unexpected Git shallow-repository response/);
});
test("reports sparse checkout without treating malformed Git output as complete", () => {
    assert.deepEqual(sparseCheckoutArguments(), ["config", "--bool", "--get", "core.sparseCheckout"]);
    assert.deepEqual(sparseCheckoutWarnings("true\n"), [
        {
            code: "sparse_checkout",
            message: "Sparse checkout is enabled; current-file existence and references may be incomplete.",
        },
    ]);
    assert.deepEqual(sparseCheckoutWarnings("false\r\n"), []);
    assert.deepEqual(sparseCheckoutWarnings(""), []);
    assert.throws(() => sparseCheckoutWarnings("enabled\n"), /Unexpected Git sparse-checkout response/);
});
test("returns empty history evidence and no burst clusters for an empty repository", () => {
    const history = parseNonMergeGitLog("");
    const nonemptyHistory = [{ hash: "commit", committerTimestampMs: 1_000, changes: [] }];
    const temporalClusters = splitTemporalClusters(history, 1_000);
    assert.deepEqual(emptyHistoryWarnings(history), [
        { code: "empty_repository", message: "Repository has no commits; burst and consolidation history is unavailable." },
    ]);
    assert.deepEqual(emptyHistoryWarnings(nonemptyHistory), []);
    assert.deepEqual(temporalClusters, []);
    assert.deepEqual(splitAtChangePoint(history), []);
    assert.deepEqual(retainClosedTemporalClusters(temporalClusters, 10_000, 1_000), []);
    assert.deepEqual(retainQualifiedClosedClusters(temporalClusters), []);
});
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
test("keeps copied and recreated paths in separate logical generations", () => {
    const activities = resolveRenameActivities([
        {
            hash: "create-source",
            committerTimestampMs: 1_000,
            changes: [{ status: "added", path: "src/source.ts" }],
        },
        {
            hash: "copy-source",
            committerTimestampMs: 2_000,
            changes: [{ status: "copied", previousPath: "src/source.ts", path: "src/copy.ts" }],
        },
        {
            hash: "modify-source",
            committerTimestampMs: 3_000,
            changes: [{ status: "modified", path: "src/source.ts" }],
        },
        {
            hash: "create-recreated",
            committerTimestampMs: 4_000,
            changes: [{ status: "added", path: "src/recreated.ts" }],
        },
        {
            hash: "delete-recreated",
            committerTimestampMs: 5_000,
            changes: [{ status: "deleted", path: "src/recreated.ts" }],
        },
        {
            hash: "recreate",
            committerTimestampMs: 6_000,
            changes: [{ status: "added", path: "src/recreated.ts" }],
        },
    ]);
    const source = activities.find((activity) => activity.identity === "src/source.ts");
    const copy = activities.find((activity) => activity.identity === "src/copy.ts");
    const recreations = activities.filter((activity) => activity.paths[0] === "src/recreated.ts");
    assert.deepEqual(source, {
        identity: "src/source.ts",
        currentPath: "src/source.ts",
        paths: ["src/source.ts"],
        firstCommitTimestampMs: 1_000,
        lastCommitTimestampMs: 3_000,
        commitCount: 2,
        created: true,
        deleted: false,
        existsAtHead: true,
    });
    assert.deepEqual(copy, {
        identity: "src/copy.ts",
        currentPath: "src/copy.ts",
        paths: ["src/copy.ts"],
        firstCommitTimestampMs: 2_000,
        lastCommitTimestampMs: 2_000,
        commitCount: 1,
        created: true,
        deleted: false,
        existsAtHead: true,
    });
    assert.equal(recreations.length, 2);
    assert.notEqual(recreations[0].identity, recreations[1].identity);
    assert.equal(recreations[0].currentPath, undefined);
    assert.equal(recreations[0].deleted, true);
    assert.equal(recreations[1].currentPath, "src/recreated.ts");
    assert.equal(recreations[1].existsAtHead, true);
});
test("filters whole rename identities without discarding cross-extension source history", () => {
    const fullHistory = [
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
        {
            hash: "three",
            committerTimestampMs: 3_000,
            changes: [{ status: "added", path: "src/live.js" }],
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
    assert.deepEqual(fullHistory.flatMap((commit) => commit.changes.map((change) => change.path)), ["src/candidate.ts", "docs/candidate.md", "src/live.js"]);
    assert.deepEqual(filterHistoryByExtensions(fullHistory, new Set()), fullHistory);
});
test("normalizes extension dots and case before case-insensitive path matching", () => {
    const extensions = normalizeExtensions(["ts", ".TS", "Js", ".js"]);
    const history = [
        {
            hash: "typescript",
            committerTimestampMs: 1_000,
            changes: [{ status: "added", path: "src/Feature.Ts" }],
        },
        {
            hash: "markdown",
            committerTimestampMs: 2_000,
            changes: [{ status: "added", path: "docs/README.MD" }],
        },
    ];
    assert.deepEqual(extensions, [".ts", ".js"]);
    assert.deepEqual(filterHistoryByExtensions(history, new Set(extensions)), [history[0]]);
});
test("splits chronological commits when an adjacent gap is one millisecond above the threshold", () => {
    const commits = [
        { hash: "first", committerTimestampMs: 1_000, changes: [] },
        { hash: "second", committerTimestampMs: 1_500, changes: [] },
        { hash: "third", committerTimestampMs: 2_001, changes: [] },
    ];
    const clusters = splitTemporalClusters(commits, 500);
    assert.deepEqual(clusters.map((cluster) => cluster.map((commit) => commit.hash)), [["first", "second"], ["third"]]);
});
test("keeps chronological commits together when their adjacent gap equals the threshold", () => {
    const clusters = splitTemporalClusters([
        { hash: "first", committerTimestampMs: 1_000, changes: [] },
        { hash: "second", committerTimestampMs: 1_500, changes: [] },
    ], 500);
    assert.deepEqual(clusters.map((cluster) => cluster.map((commit) => commit.hash)), [["first", "second"]]);
});
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
        changes: changedPaths.map((path) => ({ status: "modified", path })),
    }));
    const leftFiles = new Set(commits.slice(0, 5).flatMap((commit) => commit.changes.map((change) => change.path)));
    const rightFiles = new Set(commits.slice(5).flatMap((commit) => commit.changes.map((change) => change.path)));
    const unweightedSimilarity = [...leftFiles].filter((path) => rightFiles.has(path)).length / new Set([...leftFiles, ...rightFiles]).size;
    assert.equal(unweightedSimilarity, 1 / 7);
    assert.ok(unweightedSimilarity > 0.1);
    const partitions = splitAtChangePoint(commits);
    assert.deepEqual(partitions.map((partition) => partition.map((commit) => commit.hash)), [
        ["0", "1", "2", "3", "4"],
        ["5", "6", "7", "8", "9"],
    ]);
});
test("keeps close low-similarity work together when a side is too small", () => {
    const hour = 60 * 60 * 1_000;
    const fourCommitPartition = ["left-a.ts", "left-b.ts", "left-c.ts", "left-a.ts"];
    const fiveCommitPartition = ["right-a.ts", "right-b.ts", "right-c.ts", "right-a.ts", "right-b.ts"];
    const fewerThanFiveCommits = [...fourCommitPartition, ...fiveCommitPartition].map((path, index) => ({
        hash: `commit-${index}`,
        committerTimestampMs: index < 4 ? index * hour : (index + 3) * hour,
        changes: [{ status: "modified", path }],
    }));
    const fewerThanThreeFiles = [
        "left-a.ts",
        "left-b.ts",
        "left-a.ts",
        "left-b.ts",
        "left-a.ts",
        "right-a.ts",
        "right-b.ts",
        "right-c.ts",
        "right-a.ts",
        "right-b.ts",
    ].map((path, index) => ({
        hash: `few-files-${index}`,
        committerTimestampMs: index < 5 ? index * hour : (index + 3) * hour,
        changes: [{ status: "modified", path }],
    }));
    assert.deepEqual(splitAtChangePoint(fewerThanFiveCommits), [fewerThanFiveCommits]);
    assert.deepEqual(splitAtChangePoint(fewerThanThreeFiles), [fewerThanThreeFiles]);
});
test("ranks close change points deterministically and recursively splits both sides", () => {
    const hour = 60 * 60 * 1_000;
    const uniqueFileSets = Array.from({ length: 11 }, (_, index) => [
        `file-${index}-a.ts`,
        `file-${index}-b.ts`,
        `file-${index}-c.ts`,
    ]);
    const lowerSimilarityWins = uniqueFileSets.map((paths) => [...paths]);
    lowerSimilarityWins[5][0] = "bridge.ts";
    lowerSimilarityWins[6][0] = "bridge.ts";
    assert.deepEqual(splitAtChangePoint(changePointCommits(lowerSimilarityWins, new Map([
        [5, 4 * hour],
        [6, 8 * hour],
    ]))).map((partition) => partition.length), [5, 6]);
    assert.deepEqual(splitAtChangePoint(changePointCommits(uniqueFileSets, new Map([
        [5, 4 * hour],
        [6, 8 * hour],
    ]))).map((partition) => partition.length), [6, 5]);
    assert.deepEqual(splitAtChangePoint(changePointCommits(uniqueFileSets, new Map([
        [5, 4 * hour],
        [6, 4 * hour],
    ]))).map((partition) => partition.length), [5, 6]);
    const recursiveFileSets = Array.from({ length: 6 }, (_, group) => Array.from({ length: 5 }, () => [`group-${group}-a.ts`, `group-${group}-b.ts`, `group-${group}-c.ts`])).flat();
    const recursivePartitions = splitAtChangePoint(changePointCommits(recursiveFileSets, new Map([
        [5, 4 * hour],
        [10, 4 * hour],
        [15, 8 * hour],
        [20, 4 * hour],
        [25, 4 * hour],
    ])));
    assert.deepEqual(recursivePartitions.map((partition) => partition.map((commit) => commit.hash)), Array.from({ length: 6 }, (_, group) => Array.from({ length: 5 }, (_, offset) => `point-${group * 5 + offset}`)));
});
test("builds final burst activity from recursive close-split partitions", () => {
    const hour = 60 * 60 * 1_000;
    const group = (name, start) => [
        { hash: `${name}-a`, committerTimestampMs: start, changes: [{ status: "added", path: `${name}-a.ts` }] },
        {
            hash: `${name}-b`,
            committerTimestampMs: start + hour,
            changes: [{ status: "added", path: `${name}-b.ts` }],
        },
        {
            hash: `${name}-c`,
            committerTimestampMs: start + 2 * hour,
            changes: [{ status: "added", path: `${name}-c.ts` }],
        },
        {
            hash: `${name}-d`,
            committerTimestampMs: start + 3 * hour,
            changes: [{ status: "modified", path: `${name}-a.ts` }],
        },
        {
            hash: `${name}-e`,
            committerTimestampMs: start + 4 * hour,
            changes: [{ status: "modified", path: `${name}-b.ts` }],
        },
    ];
    const temporalCluster = [...group("first", 0), ...group("second", 8 * hour), ...group("third", 16 * hour)];
    const fullHistory = [
        ...temporalCluster,
        {
            hash: "after-first",
            committerTimestampMs: 30 * hour,
            changes: [{ status: "modified", path: "first-a.ts" }],
        },
    ];
    const bursts = assembleClosedBursts(fullHistory, [temporalCluster]);
    assert.deepEqual(bursts.map((burst) => ({
        id: burst.id,
        start: burst.startTimestampMs,
        end: burst.endTimestampMs,
        commits: burst.commits.map((commit) => commit.hash),
        files: burst.files.map((file) => [file.path, file.burstCommits, file.postBurstCommits, file.createdInBurst]),
    })), [
        {
            id: "burst-first-a-first-e",
            start: 0,
            end: 4 * hour,
            commits: ["first-a", "first-b", "first-c", "first-d", "first-e"],
            files: [
                ["first-a.ts", 2, 1, true],
                ["first-b.ts", 2, 0, true],
                ["first-c.ts", 1, 0, true],
            ],
        },
        {
            id: "burst-second-a-second-e",
            start: 8 * hour,
            end: 12 * hour,
            commits: ["second-a", "second-b", "second-c", "second-d", "second-e"],
            files: [
                ["second-a.ts", 2, 0, true],
                ["second-b.ts", 2, 0, true],
                ["second-c.ts", 1, 0, true],
            ],
        },
        {
            id: "burst-third-a-third-e",
            start: 16 * hour,
            end: 20 * hour,
            commits: ["third-a", "third-b", "third-c", "third-d", "third-e"],
            files: [
                ["third-a.ts", 2, 0, true],
                ["third-b.ts", 2, 0, true],
                ["third-c.ts", 1, 0, true],
            ],
        },
    ]);
    assert.ok(bursts.every((burst) => burst.closed));
});
test("drops closed clusters below either qualification minimum", () => {
    const fewerThanFiveCommits = [
        { hash: "one", committerTimestampMs: 1, changes: [{ status: "added", path: "one.ts" }] },
        { hash: "two", committerTimestampMs: 2, changes: [{ status: "added", path: "two.ts" }] },
        { hash: "three", committerTimestampMs: 3, changes: [{ status: "added", path: "three.ts" }] },
        { hash: "four", committerTimestampMs: 4, changes: [{ status: "modified", path: "one.ts" }] },
    ];
    const fewerThanThreeLogicalFiles = [
        { hash: "five", committerTimestampMs: 5, changes: [{ status: "added", path: "first.ts" }] },
        {
            hash: "six",
            committerTimestampMs: 6,
            changes: [{ status: "renamed", previousPath: "first.ts", path: "second.ts" }],
        },
        {
            hash: "seven",
            committerTimestampMs: 7,
            changes: [{ status: "renamed", previousPath: "second.ts", path: "third.ts" }],
        },
        { hash: "eight", committerTimestampMs: 8, changes: [{ status: "modified", path: "third.ts" }] },
        { hash: "nine", committerTimestampMs: 9, changes: [{ status: "modified", path: "third.ts" }] },
    ];
    const exactMinimum = [
        { hash: "ten", committerTimestampMs: 10, changes: [{ status: "added", path: "alpha.ts" }] },
        { hash: "eleven", committerTimestampMs: 11, changes: [{ status: "added", path: "beta.ts" }] },
        { hash: "twelve", committerTimestampMs: 12, changes: [{ status: "added", path: "gamma.ts" }] },
        { hash: "thirteen", committerTimestampMs: 13, changes: [{ status: "modified", path: "alpha.ts" }] },
        { hash: "fourteen", committerTimestampMs: 14, changes: [{ status: "modified", path: "beta.ts" }] },
    ];
    assert.deepEqual(retainQualifiedClosedClusters([fewerThanFiveCommits, fewerThanThreeLogicalFiles, exactMinimum]), [
        exactMinimum,
    ]);
});
test("excludes recent qualifying clusters before closed-cluster qualification", () => {
    const analysisTimestampMs = 10_000;
    const gapMilliseconds = 1_000;
    const clusterEndingAt = (prefix, endTimestampMs) => Array.from({ length: 5 }, (_, index) => ({
        hash: `${prefix}-${index}`,
        committerTimestampMs: endTimestampMs - 4 + index,
        changes: [{ status: "modified", path: `${prefix}-${index % 3}.ts` }],
    }));
    const recent = clusterEndingAt("recent", analysisTimestampMs - gapMilliseconds + 1);
    const closed = clusterEndingAt("closed", analysisTimestampMs - gapMilliseconds);
    const inactiveClusters = retainClosedTemporalClusters([recent, closed], analysisTimestampMs, gapMilliseconds);
    assert.deepEqual(inactiveClusters, [closed]);
    assert.deepEqual(retainQualifiedClosedClusters(inactiveClusters), [closed]);
});
test("selects only files with at least three post-burst commits", () => {
    const files = [
        {
            identity: "survives",
            path: "survives.ts",
            burstCommits: 2,
            postBurstCommits: 3,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "quiet",
            path: "quiet.ts",
            burstCommits: 2,
            postBurstCommits: 2,
            createdInBurst: true,
            existsAtHead: true,
        },
    ];
    assert.deepEqual(selectAbsoluteSurvivors(files), [files[0]]);
    assert.equal(files[1].postBurstCommits, 2);
});
test("selects positive relative survivors inclusively with absolute survivors", () => {
    const files = [
        {
            identity: "absolute",
            path: "absolute.ts",
            burstCommits: 1,
            postBurstCommits: 3,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "at-threshold",
            path: "at-threshold.ts",
            burstCommits: 1,
            postBurstCommits: 20,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "below-threshold",
            path: "below-threshold.ts",
            burstCommits: 1,
            postBurstCommits: 2,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "maximum",
            path: "maximum.ts",
            burstCommits: 1,
            postBurstCommits: 100,
            createdInBurst: true,
            existsAtHead: true,
        },
    ];
    assert.deepEqual(selectRelativeSurvivors(files), [files[1], files[3]]);
    assert.deepEqual(selectSurvivors(files), [files[0], files[1], files[3]]);
});
test("does not select relative survivors when every post-burst count is zero", () => {
    const files = [
        {
            identity: "first",
            path: "first.ts",
            burstCommits: 2,
            postBurstCommits: 0,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "second",
            path: "second.ts",
            burstCommits: 1,
            postBurstCommits: 0,
            createdInBurst: false,
            existsAtHead: true,
        },
    ];
    assert.deepEqual(selectRelativeSurvivors(files), []);
    assert.deepEqual(selectSurvivors(files), []);
});
test("selects only current files that meet neither survivor rule", () => {
    const files = [
        {
            identity: "quiet",
            path: "quiet.ts",
            burstCommits: 1,
            postBurstCommits: 1,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "absolute-survivor",
            path: "absolute-survivor.ts",
            burstCommits: 1,
            postBurstCommits: 3,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "relative-survivor",
            path: "relative-survivor.ts",
            burstCommits: 1,
            postBurstCommits: 20,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "maximum",
            path: "maximum.ts",
            burstCommits: 1,
            postBurstCommits: 100,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "deleted",
            path: "deleted.ts",
            burstCommits: 1,
            postBurstCommits: 1,
            createdInBurst: true,
            existsAtHead: false,
        },
    ];
    assert.deepEqual(selectFossilCandidates(files), [files[0]]);
});
test("records deleted non-survivors separately from current candidates", () => {
    const files = [
        {
            identity: "deleted-quiet",
            path: "deleted-quiet.ts",
            burstCommits: 1,
            postBurstCommits: 1,
            createdInBurst: true,
            existsAtHead: false,
        },
        {
            identity: "current-quiet",
            path: "current-quiet.ts",
            burstCommits: 1,
            postBurstCommits: 1,
            createdInBurst: true,
            existsAtHead: true,
        },
        {
            identity: "deleted-survivor",
            path: "deleted-survivor.ts",
            burstCommits: 1,
            postBurstCommits: 100,
            createdInBurst: true,
            existsAtHead: false,
        },
    ];
    assert.deepEqual(selectFossilCandidates(files), [files[1]]);
    assert.deepEqual(selectDeletedNonSurvivorPaths(files), ["deleted-quiet.ts"]);
});
//# sourceMappingURL=git-analyzer.test.js.map