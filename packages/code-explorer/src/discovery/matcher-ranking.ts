import { damerauLevenshtein } from "./damerau-levenshtein.js";
import type { DiscoveryMatch } from "./discovery-match.js";
import type { MatchClass } from "./match-class.js";
import type { MatchEvidence } from "./match-evidence.js";
import { normalizeValue } from "./matcher-normalize.js";

export function classify(
  query: string,
  candidate: string,
): MatchEvidence | undefined {
  if (candidate === query) return { match_class: "exact", match_score: 100 };
  const matchScore = similarity(query, candidate);
  if (candidate.startsWith(query))
    return { match_class: "prefix", match_score: Math.round(matchScore) };
  return matchScore >= 60
    ? { match_class: "fuzzy", match_score: Math.round(matchScore) }
    : undefined;
}

function similarity(left: string, right: string): number {
  const maximum = Math.max(Array.from(left).length, Array.from(right).length);
  if (maximum === 0) return 100;
  return ((maximum - damerauLevenshtein(left, right)) / maximum) * 100;
}

export function compareMatches(
  left: DiscoveryMatch,
  right: DiscoveryMatch,
): number {
  const comparisons = [
    classOrder(left.match_class) - classOrder(right.match_class),
    right.match_score - left.match_score,
    compareText(left.path, right.path),
    compareText(matchKind(left), matchKind(right)),
    compareText(left.identity, right.identity),
    compareCodePoints(left.path, right.path),
    compareCodePoints(matchKind(left), matchKind(right)),
    compareCodePoints(left.identity, right.identity),
  ];
  return comparisons.find((comparison) => comparison !== 0) ?? 0;
}

function matchKind(match: DiscoveryMatch): string {
  if (match.type === "symbol") return match.kind;
  return "";
}

export function compareEvidence(
  left: MatchEvidence,
  right: MatchEvidence,
): number {
  return (
    classOrder(left.match_class) - classOrder(right.match_class) ||
    right.match_score - left.match_score
  );
}

function compareText(left: string, right: string): number {
  return normalizeValue(left) < normalizeValue(right)
    ? -1
    : normalizeValue(left) > normalizeValue(right)
      ? 1
      : 0;
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const commonLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < commonLength; index += 1) {
    const difference = codePointDifference(
      leftPoints[index],
      rightPoints[index],
    );
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function codePointDifference(
  left: string | undefined,
  right: string | undefined,
): number {
  if (left === undefined || right === undefined)
    throw new Error("invalid code point comparison index");
  const leftValue = left.codePointAt(0);
  const rightValue = right.codePointAt(0);
  if (leftValue === undefined || rightValue === undefined)
    throw new Error("invalid code point comparison value");
  return leftValue - rightValue;
}

function classOrder(matchClass: MatchClass): number {
  if (matchClass === "exact") return 0;
  if (matchClass === "prefix") return 1;
  return 2;
}
