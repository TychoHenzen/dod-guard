export type DiscoveryCandidate =
  | { type: "symbol"; name: string; path: string; kind: string; identity: string }
  | { type: "file"; path: string; identity: string };

export type MatchClass = "exact" | "prefix" | "fuzzy";
export type DiscoveryMatch = DiscoveryCandidate & { match_class: MatchClass; match_score: number };

type CandidateName = { candidate: DiscoveryCandidate; values: readonly string[] };
type MatchEvidence = { match_class: MatchClass; match_score: number };

/** Matches a non-empty query using Unicode-normalized visible discovery evidence. */
export function matchDiscoveryCandidates(query: string, candidates: readonly DiscoveryCandidate[]): DiscoveryMatch[] {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length === 0) return [];

  return candidates
    .map((candidate) => matchCandidate(normalizedQuery, candidate))
    .filter((candidate): candidate is DiscoveryMatch => candidate !== undefined)
    .sort(compareMatches);
}

function matchCandidate(query: string, candidate: DiscoveryCandidate): DiscoveryMatch | undefined {
  const normalized = normalizeCandidate(candidate);
  if (normalized === undefined) return undefined;

  const evidence = normalized.values
    .map((value) => classify(query, value))
    .filter((match): match is MatchEvidence => match !== undefined)
    .sort(compareEvidence)[0];
  return evidence === undefined ? undefined : { ...normalized.candidate, ...evidence };
}

function normalizeCandidate(candidate: DiscoveryCandidate): CandidateName | undefined {
  const path = normalizeProjectPath(candidate.path);
  if (path === undefined) return undefined;

  if (candidate.type === "symbol")
    return { candidate: { ...candidate, path }, values: [normalizeValue(candidate.name)] };

  const filename = path.split("/").at(-1) ?? path;
  const stem = filename.replace(/\.[^.]+$/, "");
  return { candidate: { ...candidate, path }, values: [...new Set([normalizeValue(filename), normalizeValue(stem)])] };
}

function classify(query: string, candidate: string): MatchEvidence | undefined {
  if (candidate === query) return { match_class: "exact", match_score: 100 };

  const matchScore = similarity(query, candidate);
  if (candidate.startsWith(query)) return { match_class: "prefix", match_score: Math.round(matchScore) };
  return matchScore >= 60 ? { match_class: "fuzzy", match_score: Math.round(matchScore) } : undefined;
}

function normalizeQuery(value: string): string {
  return normalizeValue(value).trim();
}

function normalizeValue(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

/** Returns a portable, project-relative path or rejects unsafe backend output. */
function normalizeProjectPath(path: string): string | undefined {
  const portable = path.replace(/\\/g, "/");
  const firstSegment = portable.split("/", 1)[0];
  if (
    portable.length === 0 ||
    portable.startsWith("/") ||
    portable.startsWith("//") ||
    /^[A-Za-z]:($|\/)/.test(portable) ||
    firstSegment?.includes(":")
  ) {
    return undefined;
  }

  const parts: string[] = [];
  for (const part of portable.split("/")) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") return undefined;
    parts.push(part);
  }
  return parts.length === 0 ? undefined : parts.join("/");
}

function similarity(left: string, right: string): number {
  const maximum = Math.max(codePoints(left).length, codePoints(right).length);
  if (maximum === 0) return 100;
  return ((maximum - damerauLevenshtein(left, right)) / maximum) * 100;
}

/**
 * Computes unrestricted Damerau-Levenshtein distance over Unicode code points.
 * It tracks prior occurrences, so repeated, non-adjacent transpositions do not
 * fall back to the restricted optimal-string-alignment distance.
 */
function damerauLevenshtein(left: string, right: string): number {
  const source = codePoints(left);
  const target = codePoints(right);
  const infinity = source.length + target.length;
  const matrix = Array.from({ length: source.length + 2 }, () => Array<number>(target.length + 2).fill(0));

  setMatrixCell(matrix, 0, 0, infinity);
  for (let row = 0; row <= source.length; row++) {
    setMatrixCell(matrix, row + 1, 0, infinity);
    setMatrixCell(matrix, row + 1, 1, row);
  }
  for (let column = 0; column <= target.length; column++) {
    setMatrixCell(matrix, 0, column + 1, infinity);
    setMatrixCell(matrix, 1, column + 1, column);
  }

  const lastSeen = new Map<string, number>();
  for (let row = 1; row <= source.length; row++) {
    let lastMatchingColumn = 0;
    for (let column = 1; column <= target.length; column++) {
      const targetCharacter = target[column - 1];
      const sourceCharacter = source[row - 1];
      if (targetCharacter === undefined || sourceCharacter === undefined)
        throw new Error("invalid Damerau-Levenshtein index");

      const sourceMatchRow = lastSeen.get(targetCharacter) ?? 0;
      const targetMatchColumn = lastMatchingColumn;
      const cost = sourceCharacter === targetCharacter ? 0 : 1;
      if (cost === 0) lastMatchingColumn = column;

      setMatrixCell(
        matrix,
        row + 1,
        column + 1,
        Math.min(
          matrixCell(matrix, row, column) + cost,
          matrixCell(matrix, row + 1, column) + 1,
          matrixCell(matrix, row, column + 1) + 1,
          matrixCell(matrix, sourceMatchRow, targetMatchColumn) +
            (row - sourceMatchRow - 1) +
            1 +
            (column - targetMatchColumn - 1),
        ),
      );
    }
    const sourceCharacter = source[row - 1];
    if (sourceCharacter === undefined) throw new Error("invalid Damerau-Levenshtein index");
    lastSeen.set(sourceCharacter, row);
  }
  return matrixCell(matrix, source.length + 1, target.length + 1);
}

function matrixCell(matrix: readonly (readonly number[])[], row: number, column: number): number {
  const value = matrix[row]?.[column];
  if (value === undefined) throw new Error("invalid Damerau-Levenshtein matrix index");
  return value;
}

function setMatrixCell(matrix: number[][], row: number, column: number, value: number): void {
  const target = matrix[row];
  if (target === undefined) throw new Error("invalid Damerau-Levenshtein matrix index");
  target[column] = value;
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function compareMatches(left: DiscoveryMatch, right: DiscoveryMatch): number {
  return (
    classOrder(left.match_class) - classOrder(right.match_class) ||
    right.match_score - left.match_score ||
    compareText(left.path, right.path) ||
    compareText(left.type === "symbol" ? left.kind : "", right.type === "symbol" ? right.kind : "") ||
    compareText(left.identity, right.identity) ||
    compareCodePoints(left.path, right.path) ||
    compareCodePoints(left.type === "symbol" ? left.kind : "", right.type === "symbol" ? right.kind : "") ||
    compareCodePoints(left.identity, right.identity)
  );
}

function compareEvidence(left: MatchEvidence, right: MatchEvidence): number {
  return classOrder(left.match_class) - classOrder(right.match_class) || right.match_score - left.match_score;
}

function compareText(left: string, right: string): number {
  return normalizeValue(left) < normalizeValue(right) ? -1 : normalizeValue(left) > normalizeValue(right) ? 1 : 0;
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = codePoints(left);
  const rightPoints = codePoints(right);
  const commonLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < commonLength; index++) {
    const leftPoint = leftPoints[index];
    const rightPoint = rightPoints[index];
    if (leftPoint === undefined || rightPoint === undefined) throw new Error("invalid code point comparison index");
    const leftValue = leftPoint.codePointAt(0);
    const rightValue = rightPoint.codePointAt(0);
    if (leftValue === undefined || rightValue === undefined) throw new Error("invalid code point comparison value");
    const difference = leftValue - rightValue;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function classOrder(matchClass: MatchClass): number {
  if (matchClass === "exact") return 0;
  if (matchClass === "prefix") return 1;
  return 2;
}
