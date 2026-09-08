import { nextNonWhitespace } from "./reference-analysis-fallback-helpers.js";
import type {
  ReferenceRange,
} from "./reference-analysis-types/reference-range.js";

const CLOSING_DELIMITERS = new Set([")", "]", "}"]);
const OPERAND_STOPS = new Set([";", ",", "\n"]);

function closingDelimiter(character: string): string | undefined {
  if (character === "(") return ")";
  if (character === "[") return "]";
  if (character === "{") return "}";
  return undefined;
}

function isOperandStop(
  character: string,
  closings: readonly string[],
): boolean {
  if (CLOSING_DELIMITERS.has(character) && closings.length === 0) return true;
  return closings.length === 0 && OPERAND_STOPS.has(character);
}

function operandEnd(code: string, start: number): number {
  const closings: string[] = [];
  for (let end = start; end < code.length; end += 1) {
    const character = code[end];
    const closing = closingDelimiter(character);
    if (closing !== undefined) {
      closings.push(closing);
      continue;
    }
    if (closings.at(-1) === character) {
      closings.pop();
      continue;
    }
    if (isOperandStop(character, closings)) return end;
  }
  return code.length;
}

function fallbackOperandRange(
  code: string,
  match: RegExpExecArray,
): ReferenceRange | undefined {
  const start = nextNonWhitespace(code, (match.index ?? 0) + match[0].length);
  const end = operandEnd(code, start);
  if (end <= start) return undefined;
  return { start: start - 1, end };
}

export function fallbackOperandRanges(code: string): readonly ReferenceRange[] {
  const ranges: ReferenceRange[] = [];
  const matcher = /\|\||\?\?/g;
  for (let match = matcher.exec(code); match; match = matcher.exec(code)) {
    const range = fallbackOperandRange(code, match);
    if (range) ranges.push(range);
  }
  return ranges;
}
