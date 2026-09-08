import { patternCell } from "./workspace-exclusion-cells.js";

export function patternToken(pattern: string, index: number) {
  const recursiveWildcard =
    pattern[index] === "*" && pattern[index + 1] === "*";
  if (recursiveWildcard)
    return { character: "*", recursiveWildcard, nextIndex: index + 1 };
  return {
    character: pattern[index],
    recursiveWildcard: false,
    nextIndex: index,
  };
}

export function applyPattern(
  path: string,
  token: ReturnType<typeof patternToken>,
  previous: readonly boolean[],
): boolean[] {
  const current = new Array<boolean>(path.length + 1).fill(false);
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

export function globResult(
  previous: readonly boolean[],
  path: string,
): boolean {
  return Boolean(previous[path.length]);
}
