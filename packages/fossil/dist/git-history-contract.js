import { FossilAnalysisError } from "./analysis-error.js";
const RECORD_SEPARATOR = "\u001e";
/** Default maximum number of included non-merge commit records. */
export const DEFAULT_MAXIMUM_INCLUDED_COMMITS = 100_000;
/** Rejects included history that cannot be analyzed within the commit resource budget. */
export function assertIncludedCommitLimit(includedCommitCount, maximumIncludedCommits = DEFAULT_MAXIMUM_INCLUDED_COMMITS) {
    if (includedCommitCount > maximumIncludedCommits)
        throw new FossilAnalysisError({
            code: "resource_limit",
            message: "Included commit limit exceeded.",
        });
}
/** Arguments for the raw history stream consumed by parseNonMergeGitLog(). */
export function nonMergeGitLogArguments() {
    return [
        "log",
        "--no-ext-diff",
        "HEAD",
        "--no-merges",
        "--find-renames=50%",
        "--format=%x1e%H%x00%ct%x00",
        "--name-status",
        "-z",
    ];
}
/** Arguments for checking whether Git marks the repository as shallow. */
export function shallowRepositoryArguments() {
    return ["rev-parse", "--is-shallow-repository"];
}
/** Turns Git's strict shallow-repository response into completeness evidence. */
export function shallowHistoryWarnings(result) {
    if (result === "true" || result === "true\n" || result === "true\r\n") {
        return [
            {
                code: "shallow_history",
                message: "Repository is shallow; burst and consolidation history may be incomplete.",
            },
        ];
    }
    if (result === "false" || result === "false\n" || result === "false\r\n")
        return [];
    throw new Error("Unexpected Git shallow-repository response");
}
/** Arguments for reading the sparse-checkout setting for the target worktree. */
export function sparseCheckoutArguments() {
    return ["config", "--bool", "--get", "core.sparseCheckout"];
}
/** Turns Git's strict sparse-checkout response into current-tree completeness evidence. */
export function sparseCheckoutWarnings(result) {
    if (result === "true" || result === "true\n" || result === "true\r\n") {
        return [
            {
                code: "sparse_checkout",
                message: "Sparse checkout is enabled; current-file existence and references may be incomplete.",
            },
        ];
    }
    if (result === "" || result === "false" || result === "false\n" || result === "false\r\n")
        return [];
    throw new Error("Unexpected Git sparse-checkout response");
}
export { RECORD_SEPARATOR };
//# sourceMappingURL=git-history-contract.js.map