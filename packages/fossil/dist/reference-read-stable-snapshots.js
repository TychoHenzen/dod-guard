import { warnStableRead } from "./reference-read-stable-warn.js";
function sameSnapshot(initial, current) {
    if (current.identity !== initial.identity)
        return false;
    if (current.isRegularFile !== initial.isRegularFile)
        return false;
    if (current.byteLength !== initial.byteLength)
        return false;
    if (current.canonicalPath !== initial.canonicalPath)
        return false;
    return true;
}
function unreadableSnapshot(input) {
    warnStableRead(input, "reference_unreadable", "Reference source could not be read.");
    return undefined;
}
export function inspectCurrentSnapshot(input, initial) {
    let current;
    try {
        current = input.boundary.inspect(input.source);
    }
    catch {
        return unreadableSnapshot(input);
    }
    if (!current)
        return unreadableSnapshot(input);
    if (!sameSnapshot(initial, current)) {
        warnStableRead(input, "reference_path_changed", "Reference source changed during scanning.");
        return undefined;
    }
    return current;
}
//# sourceMappingURL=reference-read-stable-snapshots.js.map