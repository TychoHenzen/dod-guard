export function terminalSafeText(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined || (codePoint > 0x1f && (codePoint < 0x7f || codePoint > 0x9f))) {
        return character;
      }
      return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    })
    .join("");
}

export function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function utcDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}
