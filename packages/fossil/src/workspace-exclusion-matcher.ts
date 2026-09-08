const MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH = 256;
const QUESTION_MARK = String.fromCharCode(63);

function patternToken(pattern: string, index: number) {
  const recursiveWildcard = pattern[index] === "*" && pattern[index + 1] === "*";
  if (recursiveWildcard) return { character: "*", recursiveWildcard, nextIndex: index + 1 };
  return { character: pattern[index], recursiveWildcard: false, nextIndex: index };
}

function validCallerGlob(pattern: string): boolean {
  if (pattern.length === 0) return false;
  return pattern.length <= MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH;
}

function canConsumePathSegment(path: string, pathIndex: number, recursiveWildcard: boolean): boolean {
  if (pathIndex === 0) return false;
  if (recursiveWildcard) return true;
  return path[pathIndex - 1] !== "/";
}

function wildcardCell(
  path: string,
  pathIndex: number,
  recursiveWildcard: boolean,
  previous: readonly boolean[],
  current: readonly boolean[],
): boolean {
  if (previous[pathIndex]) return true;
  if (!canConsumePathSegment(path, pathIndex, recursiveWildcard)) return false;
  return Boolean(current[pathIndex - 1]);
}

function questionCell(path: string, pathIndex: number, previous: readonly boolean[]): boolean {
  if (pathIndex === 0) return false;
  if (path[pathIndex - 1] === "/") return false;
  return Boolean(previous[pathIndex - 1]);
}

function exactCell(character: string | undefined, path: string, pathIndex: number, previous: readonly boolean[]): boolean {
  if (character !== path[pathIndex - 1]) return false;
  return Boolean(previous[pathIndex - 1]);
}

function patternCell(
  character: string | undefined,
  recursiveWildcard: boolean,
  path: string,
  pathIndex: number,
  previous: readonly boolean[],
  current: readonly boolean[],
): boolean {
  if (character === "*") return wildcardCell(path, pathIndex, recursiveWildcard, previous, current);
  if (pathIndex === 0) return false;
  if (character === QUESTION_MARK) return questionCell(path, pathIndex, previous);
  return exactCell(character, path, pathIndex, previous);
}

function applyPattern(
  path: string,
  token: ReturnType<typeof patternToken>,
  previous: readonly boolean[],
): boolean[] {
  const current = new Array<boolean>(path.length + 1).fill(false);
  for (let pathIndex = 0; pathIndex <= path.length; pathIndex += 1)
    current[pathIndex] = patternCell(token.character, token.recursiveWildcard, path, pathIndex, previous, current);
  return current;
}

function globResult(previous: readonly boolean[], path: string): boolean {
  return Boolean(previous[path.length]);
}

export function callerGlobMatches(path: string, pattern: string): boolean {
  if (!validCallerGlob(pattern)) return false;
  let previous = new Array<boolean>(path.length + 1).fill(false);
  previous[0] = true;
  for (let index = 0; index < pattern.length; index += 1) {
    const token = patternToken(pattern, index);
    index = token.nextIndex;
    previous = applyPattern(path, token, previous);
  }
  return globResult(previous, path);
}
