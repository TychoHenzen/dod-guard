const MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH = 256;
const QUESTION_MARK = String.fromCharCode(63);
function patternToken(pattern, index) {
    const recursiveWildcard = pattern[index] === "*" && pattern[index + 1] === "*";
    if (recursiveWildcard)
        return { character: "*", recursiveWildcard, nextIndex: index + 1 };
    return { character: pattern[index], recursiveWildcard: false, nextIndex: index };
}
function validCallerGlob(pattern) {
    if (pattern.length === 0)
        return false;
    return pattern.length <= MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH;
}
function canConsumePathSegment(path, pathIndex, recursiveWildcard) {
    if (pathIndex === 0)
        return false;
    if (recursiveWildcard)
        return true;
    return path[pathIndex - 1] !== "/";
}
function wildcardCell({ path, pathIndex, recursiveWildcard, previous, current }) {
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
function exactCell({ character, path, pathIndex, previous }) {
    if (character !== path[pathIndex - 1])
        return false;
    return Boolean(previous[pathIndex - 1]);
}
function patternCell({ character, recursiveWildcard, path, pathIndex, previous, current }) {
    if (character === "*")
        return wildcardCell({ path, pathIndex, recursiveWildcard, previous, current });
    if (pathIndex === 0)
        return false;
    if (character === QUESTION_MARK)
        return questionCell(path, pathIndex, previous);
    return exactCell({ character, path, pathIndex, previous });
}
function applyPattern(path, token, previous) {
    const current = new Array(path.length + 1).fill(false);
    for (let pathIndex = 0; pathIndex <= path.length; pathIndex += 1)
        current[pathIndex] = patternCell({
            character: token.character,
            recursiveWildcard: token.recursiveWildcard,
            path,
            pathIndex,
            previous,
            current,
        });
    return current;
}
function globResult(previous, path) {
    return Boolean(previous[path.length]);
}
export function callerGlobMatches(path, pattern) {
    if (!validCallerGlob(pattern))
        return false;
    let previous = new Array(path.length + 1).fill(false);
    previous[0] = true;
    for (let index = 0; index < pattern.length; index += 1) {
        const token = patternToken(pattern, index);
        index = token.nextIndex;
        previous = applyPattern(path, token, previous);
    }
    return globResult(previous, path);
}
//# sourceMappingURL=workspace-exclusion-matcher.js.map