export function tryCatchRanges(content: string): readonly [number, number][] {
  const ranges: [number, number][] = [];
  const stack: { kind: boolean; start: number }[] = [];
  let pendingBody: "try" | "catch" | undefined;
  let catchParameterDepth = 0;
  let quote = "";
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      let end = index + 1;
      while (/[\w$]/.test(content[end] ?? "")) end += 1;
      const word = content.slice(index, end);
      if (word === "try" || word === "catch") {
        pendingBody = word;
        catchParameterDepth = 0;
      }
      index = end - 1;
      continue;
    }
    if (pendingBody === "catch" && character === "(") {
      catchParameterDepth += 1;
      continue;
    }
    if (pendingBody === "catch" && character === ")" && catchParameterDepth > 0) {
      catchParameterDepth -= 1;
      continue;
    }
    if (character === "{") {
      const kind = pendingBody === "try" || (pendingBody === "catch" && catchParameterDepth === 0);
      stack.push({ kind, start: index });
      if (kind) pendingBody = undefined;
    } else if (character === "}") {
      const opened = stack.pop();
      if (opened?.kind) ranges.push([opened.start, index]);
    }
  }
  return ranges;
}
