import { warnStableRead } from "./reference-read-stable-warn.js";
export function hasStableCapacity(input) {
    if (input.budget.totalLimitReached ||
        input.budget.acceptedBytes >= input.maximumTotalBytes) {
        warnStableRead(input, "reference_content_limit", "Reference source exceeds the total content limit.");
        return false;
    }
    return true;
}
export function inspectInitialSnapshot(input) {
    let initial;
    try {
        initial = input.boundary.inspect(input.source);
    }
    catch {
        warnStableRead(input, "reference_unreadable", "Reference source could not be read.");
        return undefined;
    }
    if (!initial?.isRegularFile) {
        warnStableRead(input, "reference_unreadable", "Reference source could not be read.");
        return undefined;
    }
    return initial;
}
export function initialWithinLimits(input, initial) {
    if (initial.byteLength > input.maximumFileBytes) {
        warnStableRead(input, "reference_content_limit", "Reference source exceeds the per-file content limit.");
        return false;
    }
    if (input.budget.acceptedBytes + initial.byteLength >
        input.maximumTotalBytes) {
        warnStableRead(input, "reference_content_limit", "Reference source exceeds the total content limit.");
        input.budget.totalLimitReached = true;
        return false;
    }
    return true;
}
export { inspectCurrentSnapshot } from "./reference-read-stable-snapshots.js";
//# sourceMappingURL=reference-read-stable-preflight.js.map