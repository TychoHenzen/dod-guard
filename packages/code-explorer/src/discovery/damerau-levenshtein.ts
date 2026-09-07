import { DamerauMatrix } from "./damerau-matrix.js";
import { updateRow } from "./damerau-row.js";

export function damerauLevenshtein(left: string, right: string): number {
  const source = Array.from(left);
  const target = Array.from(right);
  const matrix = new DamerauMatrix(source.length, target.length);
  const lastSeen = new Map<string, number>();
  for (let row = 1; row <= source.length; row += 1)
    updateRow({ matrix, source, target, row, lastSeen });
  return matrix.get(source.length + 1, target.length + 1);
}
