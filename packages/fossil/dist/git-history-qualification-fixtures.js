export const fewerThanFiveCommits = [
    {
        hash: "one",
        committerTimestampMs: 1,
        changes: [{ status: "added", path: "one.ts" }],
    },
    {
        hash: "two",
        committerTimestampMs: 2,
        changes: [{ status: "added", path: "two.ts" }],
    },
    {
        hash: "three",
        committerTimestampMs: 3,
        changes: [{ status: "added", path: "three.ts" }],
    },
    {
        hash: "four",
        committerTimestampMs: 4,
        changes: [{ status: "modified", path: "one.ts" }],
    },
];
export const fewerThanThreeLogicalFiles = [
    {
        hash: "five",
        committerTimestampMs: 5,
        changes: [{ status: "added", path: "first.ts" }],
    },
    {
        hash: "six",
        committerTimestampMs: 6,
        changes: [
            {
                status: "renamed",
                previousPath: "first.ts",
                path: "second.ts",
            },
        ],
    },
    {
        hash: "seven",
        committerTimestampMs: 7,
        changes: [
            {
                status: "renamed",
                previousPath: "second.ts",
                path: "third.ts",
            },
        ],
    },
    {
        hash: "eight",
        committerTimestampMs: 8,
        changes: [{ status: "modified", path: "third.ts" }],
    },
    {
        hash: "nine",
        committerTimestampMs: 9,
        changes: [{ status: "modified", path: "third.ts" }],
    },
];
export const exactMinimum = [
    {
        hash: "ten",
        committerTimestampMs: 10,
        changes: [{ status: "added", path: "alpha.ts" }],
    },
    {
        hash: "eleven",
        committerTimestampMs: 11,
        changes: [{ status: "added", path: "beta.ts" }],
    },
    {
        hash: "twelve",
        committerTimestampMs: 12,
        changes: [{ status: "added", path: "gamma.ts" }],
    },
    {
        hash: "thirteen",
        committerTimestampMs: 13,
        changes: [{ status: "modified", path: "alpha.ts" }],
    },
    {
        hash: "fourteen",
        committerTimestampMs: 14,
        changes: [{ status: "modified", path: "beta.ts" }],
    },
];
//# sourceMappingURL=git-history-qualification-fixtures.js.map