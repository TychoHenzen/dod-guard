function canConsumePathSegment(path, pathIndex, recursiveWildcard) {
    if (pathIndex === 0)
        return false;
    if (recursiveWildcard)
        return true;
    return path[pathIndex - 1] !== "/";
}
function wildcardCell({ path, pathIndex, recursiveWildcard, previous, current, }) {
    if (previous[pathIndex])
        return true;
    if (!canConsumePathSegment(path, pathIndex, recursiveWildcard))
        return false;
    return Boolean(current[pathIndex - 1]);
}
function questionCell(path, pathIndex, previous) {
    if (pathIndex === 0)
        return false;
    if (path[pathIndex - 1] === "/")
        return false;
    return Boolean(previous[pathIndex - 1]);
}
function exactCell({ character, path, pathIndex, previous, }) {
    if (character !== path[pathIndex - 1])
        return false;
    return Boolean(previous[pathIndex - 1]);
}
export function patternCell({ character, recursiveWildcard, path, pathIndex, previous, current, }) {
    if (character === "*")
        return wildcardCell({
            path,
            pathIndex,
            recursiveWildcard,
            previous,
            current,
        });
    if (pathIndex === 0)
        return false;
    if (character === String.fromCharCode(63))
        return questionCell(path, pathIndex, previous);
    return exactCell({ character, path, pathIndex, previous });
}
//# sourceMappingURL=workspace-exclusion-cells.js.map