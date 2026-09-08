import { RECORD_SEPARATOR } from "./git-history-contract.js";
import { sortCommitsChronologically } from "./git-history-order.js";
const STATUS_BY_CODE = {
    A: "added",
    M: "modified",
    D: "deleted",
    R: "renamed",
    C: "copied",
    T: "type-changed",
    U: "unmerged",
};
function statusFor(rawStatus) {
    return STATUS_BY_CODE[rawStatus[0] ?? ""] ?? "unknown";
}
function parsedChange(tokens, index) {
    const rawStatus = tokens[index]?.replace(/^\r?\n/, "");
    if (!rawStatus)
        return { nextIndex: index + 1 };
    const status = statusFor(rawStatus);
    const firstPath = tokens[index + 1];
    if (firstPath === undefined)
        return undefined;
    if (status === "renamed" || status === "copied") {
        const path = tokens[index + 2];
        if (path === undefined)
            return undefined;
        return {
            change: { status, path, previousPath: firstPath },
            nextIndex: index + 3,
        };
    }
    return { change: { status, path: firstPath }, nextIndex: index + 2 };
}
function parseChanges(tokens) {
    const changes = [];
    for (let index = 0; index < tokens.length;) {
        const parsed = parsedChange(tokens, index);
        if (!parsed)
            break;
        if (parsed.change)
            changes.push(parsed.change);
        index = parsed.nextIndex;
    }
    return changes;
}
/** Parses the NUL-delimited stream requested by nonMergeGitLogArguments(). */
export function parseNonMergeGitLog(rawLog) {
    const commits = [];
    for (const record of rawLog.split(RECORD_SEPARATOR)) {
        if (!record)
            continue;
        const tokens = record.split("\0");
        const hash = tokens[0];
        const committerSeconds = Number(tokens[1]);
        if (!(hash && Number.isFinite(committerSeconds)))
            continue;
        commits.push({
            hash,
            committerTimestampMs: committerSeconds * 1_000,
            changes: parseChanges(tokens.slice(2)),
        });
    }
    return sortCommitsChronologically(commits);
}
//# sourceMappingURL=git-history-stream.js.map