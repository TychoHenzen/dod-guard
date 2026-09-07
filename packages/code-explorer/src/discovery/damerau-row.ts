import { DamerauMatrix } from "./damerau-matrix.js";

function distanceCell(
  matrix: DamerauMatrix,
  options: {
    sourceRow: number;
    targetColumn: number;
    sourceMatchRow: number;
    targetMatchColumn: number;
    cost: number;
  },
): number {
  const { sourceRow, targetColumn, sourceMatchRow, targetMatchColumn, cost } =
    options;
  return Math.min(
    matrix.get(sourceRow, targetColumn) + cost,
    matrix.get(sourceRow + 1, targetColumn) + 1,
    matrix.get(sourceRow, targetColumn + 1) + 1,
    matrix.get(sourceMatchRow, targetMatchColumn) +
      (sourceRow - sourceMatchRow - 1) +
      1 +
      (targetColumn - targetMatchColumn - 1),
  );
}

function characterAt(characters: readonly string[], index: number): string {
  const character = characters[index];
  if (character === undefined)
    throw new Error("invalid Damerau-Levenshtein index");
  return character;
}

function seenRow(lastSeen: Map<string, number>, character: string): number {
  return lastSeen.get(character) ?? 0;
}

function matchingColumn(
  cost: number,
  column: number,
  previous: number,
): number {
  return cost === 0 ? column : previous;
}

function updateColumn(options: {
  matrix: DamerauMatrix;
  sourceCharacter: string;
  targetCharacter: string;
  row: number;
  column: number;
  lastMatchingColumn: number;
  lastSeen: Map<string, number>;
}): number {
  const sourceMatchRow = seenRow(options.lastSeen, options.targetCharacter);
  const targetMatchColumn = options.lastMatchingColumn;
  const cost = options.sourceCharacter === options.targetCharacter ? 0 : 1;
  options.matrix.set(
    options.row + 1,
    options.column + 1,
    distanceCell(options.matrix, {
      sourceRow: options.row,
      targetColumn: options.column,
      sourceMatchRow,
      targetMatchColumn,
      cost,
    }),
  );
  return matchingColumn(cost, options.column, options.lastMatchingColumn);
}

export function updateRow(options: {
  matrix: DamerauMatrix;
  source: readonly string[];
  target: readonly string[];
  row: number;
  lastSeen: Map<string, number>;
}): void {
  const { matrix, source, target, row, lastSeen } = options;
  const sourceCharacter = source[row - 1];
  if (sourceCharacter === undefined)
    throw new Error("invalid Damerau-Levenshtein index");
  let lastMatchingColumn = 0;
  for (let column = 1; column <= target.length; column += 1) {
    const targetCharacter = characterAt(target, column - 1);
    lastMatchingColumn = updateColumn({
      matrix,
      sourceCharacter,
      targetCharacter,
      row,
      column,
      lastMatchingColumn,
      lastSeen,
    });
  }
  lastSeen.set(sourceCharacter, row);
}
