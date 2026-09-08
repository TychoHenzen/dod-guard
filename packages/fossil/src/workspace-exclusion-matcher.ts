import {
  applyPattern,
  globResult,
  patternToken,
} from "./workspace-exclusion-pattern.js";

const MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH = 256;

function validCallerGlob(pattern: string): boolean {
  if (pattern.length === 0) return false;
  return pattern.length <= MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH;
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
