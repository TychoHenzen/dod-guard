export class DamerauMatrix {
  private readonly values: number[][];

  constructor(sourceLength: number, targetLength: number) {
    const infinity = sourceLength + targetLength;
    this.values = Array.from({ length: sourceLength + 2 }, () =>
      Array<number>(targetLength + 2).fill(0),
    );
    this.set(0, 0, infinity);
    for (let row = 0; row <= sourceLength; row += 1) {
      this.set(row + 1, 0, infinity);
      this.set(row + 1, 1, row);
    }
    for (let column = 0; column <= targetLength; column += 1) {
      this.set(0, column + 1, infinity);
      this.set(1, column + 1, column);
    }
  }

  get(row: number, column: number): number {
    const value = this.values[row]?.[column];
    if (value === undefined)
      throw new Error("invalid Damerau-Levenshtein matrix index");
    return value;
  }

  set(row: number, column: number, value: number): void {
    const target = this.values[row];
    if (target === undefined)
      throw new Error("invalid Damerau-Levenshtein matrix index");
    target[column] = value;
  }
}
