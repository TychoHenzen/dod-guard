import { patternCell } from "./workspace-exclusion-cells.js";
export function patternToken(pattern, index) {
    const recursiveWildcard = pattern[index] === "*" && pattern[index + 1] === "*";
    if (recursiveWildcard)
        return { character: "*", recursiveWildcard, nextIndex: index + 1 };
    return {
        character: pattern[index],
        recursiveWildcard: false,
        nextIndex: index,
    };
}
export function applyPattern(path, token, previous) {
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
export function globResult(previous, path) {
    return Boolean(previous[path.length]);
}
//# sourceMappingURL=workspace-exclusion-pattern.js.map