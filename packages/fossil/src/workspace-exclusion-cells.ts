function canConsumePathSegment(
  path: string,
  pathIndex: number,
  recursiveWildcard: boolean,
): boolean {
  if (pathIndex === 0) return false;
  if (recursiveWildcard) return true;
  return path[pathIndex - 1] !== "/";
}

function wildcardCell({
  path,
  pathIndex,
  recursiveWildcard,
  previous,
  current,
}: {
  path: string;
  pathIndex: number;
  recursiveWildcard: boolean;
  previous: readonly boolean[];
  current: readonly boolean[];
}): boolean {
  if (previous[pathIndex]) return true;
  if (!canConsumePathSegment(path, pathIndex, recursiveWildcard)) return false;
  return Boolean(current[pathIndex - 1]);
}

function questionCell(
  path: string,
  pathIndex: number,
  previous: readonly boolean[],
): boolean {
  if (pathIndex === 0) return false;
  if (path[pathIndex - 1] === "/") return false;
  return Boolean(previous[pathIndex - 1]);
}

function exactCell({
  character,
  path,
  pathIndex,
  previous,
}: {
  character: string | undefined;
  path: string;
  pathIndex: number;
  previous: readonly boolean[];
}): boolean {
  if (character !== path[pathIndex - 1]) return false;
  return Boolean(previous[pathIndex - 1]);
}

export function patternCell({
  character,
  recursiveWildcard,
  path,
  pathIndex,
  previous,
  current,
}: {
  character: string | undefined;
  recursiveWildcard: boolean;
  path: string;
  pathIndex: number;
  previous: readonly boolean[];
  current: readonly boolean[];
}): boolean {
  if (character === "*")
    return wildcardCell({
      path,
      pathIndex,
      recursiveWildcard,
      previous,
      current,
    });
  if (pathIndex === 0) return false;
  if (character === String.fromCharCode(63))
    return questionCell(path, pathIndex, previous);
  return exactCell({ character, path, pathIndex, previous });
}
